from typing import Dict, Set, Optional, List
from fastapi import WebSocket
import json
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # {room_id: {session_id: WebSocket}}
        self.connections: Dict[str, Dict[str, WebSocket]] = {}
        # session_id -> room_id (for quick lookups)
        self.session_to_room: Dict[str, str] = {}
    
    async def add_to_room(self, session_id: str, room_id: str, websocket: WebSocket):
        """Add session WebSocket to room"""
        if room_id not in self.connections:
            self.connections[room_id] = {}
        
        # Remove from previous room if exists
        if session_id in self.session_to_room:
            await self.remove_from_room(session_id)
        
        self.connections[room_id][session_id] = websocket
        self.session_to_room[session_id] = room_id
        
        logger.info(f"Session {session_id} joined room {room_id}")
        
        # Notify others in room
        await self.broadcast_to_room(room_id, {
            "type": "player_joined",
            "session_id": session_id
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
        
        # Notify others in room
        await self.broadcast_to_room(room_id, {
            "type": "player_left",
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
        
        await self.remove_from_room(session_id)