from typing import Dict, Set, Optional, List, Any
from fastapi import WebSocket
import json
import logging
from .message_sequencer import MessageSequencer

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # {room_id: {session_id: WebSocket}}
        self.connections: Dict[str, Dict[str, WebSocket]] = {}
        # session_id -> room_id (for quick lookups)
        self.session_to_room: Dict[str, str] = {}
        # Message sequencer for handling checkpoints and sequence numbers
        self.sequencer = MessageSequencer()
    
    async def add_to_room(self, session_id: str, room_id: str, websocket: WebSocket, nickname: str = None, is_host: bool = False):
        """Add session WebSocket to room"""
        if room_id not in self.connections:
            self.connections[room_id] = {}
        
        # Remove from previous room if exists
        if session_id in self.session_to_room:
            await self.remove_from_room(session_id)
        
        self.connections[room_id][session_id] = websocket
        self.session_to_room[session_id] = room_id
        
        logger.info(f"Session {session_id} joined room {room_id}")
        
        # Send sequenced message to others in room
        await self.send_sequenced_message(room_id, "player_joined", {
            "player": {
                "id": session_id,
                "nickname": nickname,
                "isHost": is_host
            }
        }, exclude_session=session_id)
    
    async def remove_from_room(self, session_id: str):
        """Remove session from its room"""
        if session_id not in self.session_to_room:
            return
        
        room_id = self.session_to_room[session_id]
        
        # Remove from connections
        if room_id in self.connections:
            self.connections[room_id].pop(session_id, None)
            if not self.connections[room_id]:  # Clean up empty rooms
                del self.connections[room_id]
        
        # Remove from session mapping
        del self.session_to_room[session_id]
        
        logger.info(f"Session {session_id} left room {room_id}")
        
        # Send sequenced message to others in room
        await self.send_sequenced_message(room_id, "player_left", {
            "session_id": session_id
        })
    
    async def send_to_session(self, session_id: str, message: Dict):
        """Send message to specific session"""
        room_id = self.session_to_room.get(session_id)
        if not room_id or room_id not in self.connections:
            logger.warning(f"Session {session_id} not found in any room")
            return
        
        websocket = self.connections[room_id].get(session_id)
        if not websocket:
            logger.warning(f"WebSocket for session {session_id} not found")
            return
        
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending to session {session_id}: {e}")
            # Connection might be broken, remove it
            await self.remove_from_room(session_id)
    
    async def broadcast_to_room(self, room_id: str, message: Dict, exclude_session: Optional[str] = None):
        """Broadcast to all sessions in a room"""
        if room_id not in self.connections:
            logger.warning(f"Room {room_id} not found")
            return
        
        disconnected_sessions = []
        
        for session_id, websocket in self.connections[room_id].items():
            if session_id == exclude_session:
                continue
            
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to session {session_id}: {e}")
                disconnected_sessions.append(session_id)
        
        # Clean up disconnected sessions
        for session_id in disconnected_sessions:
            await self.remove_from_room(session_id)
    
    def get_room_sessions(self, room_id: str) -> List[str]:
        """Get all session IDs in a room"""
        return list(self.connections.get(room_id, {}).keys())
    
    def get_session_room(self, session_id: str) -> Optional[str]:
        """Get the room ID for a session"""
        return self.session_to_room.get(session_id)
    
    def is_session_connected(self, session_id: str) -> bool:
        """Check if a session is connected"""
        return session_id in self.session_to_room
    
    async def disconnect_session(self, session_id: str):
        """Disconnect a session and clean up"""
        room_id = self.session_to_room.get(session_id)
        if room_id:
            websocket = self.connections.get(room_id, {}).get(session_id)
            if websocket:
                try:
                    await websocket.close()
                except Exception as e:
                    logger.error(f"Error closing websocket for session {session_id}: {e}")
            
            # Clean up sequencer tracking
            self.sequencer.remove_client(room_id, session_id)
        
        await self.remove_from_room(session_id)
    
    async def create_room_checkpoint(self, room_id: str, phase: str, data: Dict[str, Any]):
        """Create a checkpoint for a room and broadcast to all clients"""
        checkpoint = self.sequencer.create_checkpoint(room_id, phase, data)
        checkpoint_message = checkpoint.to_dict()
        
        # Broadcast checkpoint to all clients in room
        await self.broadcast_to_room(room_id, checkpoint_message)
        logger.info(f"Broadcasted checkpoint for room {room_id}, phase {phase}")
    
    async def send_sequenced_message(self, room_id: str, message_type: str, data: Dict[str, Any], exclude_session: Optional[str] = None):
        """Send a sequenced message to all clients in a room"""
        sequenced_msg = self.sequencer.add_message(room_id, message_type, data)
        message = sequenced_msg.to_dict()
        
        await self.broadcast_to_room(room_id, message, exclude_session)
    
    async def synchronize_client(self, room_id: str, session_id: str) -> bool:
        """Send synchronization data to a reconnecting client"""
        sync_data = self.sequencer.get_synchronization_data(room_id, session_id)
        
        if "error" in sync_data:
            logger.warning(f"Cannot synchronize client {session_id} in room {room_id}: {sync_data['error']}")
            return False
        
        websocket = self.connections.get(room_id, {}).get(session_id)
        if not websocket:
            logger.warning(f"No websocket found for session {session_id}")
            return False
        
        try:
            # Send checkpoint
            await websocket.send_json(sync_data["checkpoint"])
            
            # Send missing messages in order
            for message in sync_data["messages"]:
                await websocket.send_json(message)
            
            # Send ready signal
            await websocket.send_json({
                "type": "ready",
                "current_seq": sync_data["current_seq"]
            })
            
            # Update client's acknowledged sequence
            self.sequencer.set_client_sequence(room_id, session_id, sync_data["current_seq"])
            
            logger.info(f"Synchronized client {session_id} in room {room_id} up to seq {sync_data['current_seq']}")
            return True
            
        except Exception as e:
            logger.error(f"Error synchronizing client {session_id}: {e}")
            return False
    
    async def acknowledge_sequence(self, room_id: str, session_id: str, seq_num: int):
        """Update client's acknowledged sequence number"""
        self.sequencer.set_client_sequence(room_id, session_id, seq_num)
    
    def cleanup_room_sequencer(self, room_id: str):
        """Clean up sequencer data when room is deleted"""
        self.sequencer.cleanup_room(room_id)