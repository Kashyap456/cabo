"""
Connection management system with session/connection separation for robust reconnection handling
"""
import asyncio
import logging
import time
import uuid
from typing import Dict, Optional, Set, Tuple, Any, List
from dataclasses import dataclass, asdict
from datetime import datetime
import json

from services.redis_manager import redis_manager
from services.message_sequencer import MessageSequencer

logger = logging.getLogger(__name__)


@dataclass
class ConnectionInfo:
    """Information about a specific connection"""
    connection_id: str
    session_id: str
    room_id: Optional[str]
    nickname: Optional[str]
    is_host: bool
    connected_at: float
    last_ping: float
    last_pong: float
    last_ack_seq: int
    state: str  # 'active', 'disconnected', 'grace_period'
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ConnectionManager:
    """
    Manages WebSocket connections with support for graceful reconnection.
    Separates session identity from connection identity.
    """
    
    def __init__(self, 
                 ping_interval: float = 10.0,
                 ping_timeout: float = 20.0,
                 grace_period: float = 60.0,
                 outbox_size: int = 100):
        """
        Initialize connection manager.
        
        Args:
            ping_interval: Seconds between pings
            ping_timeout: Seconds before considering connection dead
            grace_period: Seconds to keep session alive after disconnect
            outbox_size: Number of messages to keep in outbox for replay
        """
        self.redis = redis_manager
        
        # Ensure Redis is connected on first use
        self._redis_connected = False
        self.ping_interval = ping_interval
        self.ping_timeout = ping_timeout
        self.grace_period = grace_period
        self.outbox_size = outbox_size
        
        # Message sequencer for handling checkpoints and sequence numbers
        self.sequencer = MessageSequencer()
        
        # Local tracking (for this server instance)
        self.connections: Dict[str, ConnectionInfo] = {}  # connection_id -> ConnectionInfo
        self.session_to_connection: Dict[str, str] = {}  # session_id -> connection_id
        self.websockets: Dict[str, Any] = {}  # connection_id -> WebSocket object
        
        # Legacy compatibility - map room_id to connections
        self.room_connections: Dict[str, Dict[str, Any]] = {}  # room_id -> {session_id: websocket}
        
        # Heartbeat tasks
        self.heartbeat_tasks: Dict[str, asyncio.Task] = {}  # connection_id -> Task
        
    async def add_to_room(self, session_id: str, room_id: str, websocket: Any, 
                         nickname: str = None, is_host: bool = False, 
                         is_reconnection: bool = False) -> str:
        """
        Add session WebSocket to room (legacy interface with new implementation).
        
        Returns:
            connection_id for this connection
        """
        # Handle reconnection
        if is_reconnection:
            # Get last acknowledged sequence from Redis
            last_seq = await self.get_last_ack_sequence(session_id)
            connection_id, resume_from_seq = await self.handle_reconnect(
                session_id, websocket, last_seq, room_id, nickname, is_host
            )
            
            # Replay missed messages
            if resume_from_seq > 0:
                await self.replay_messages(session_id, resume_from_seq)
            
            logger.info(f"Session {session_id} reconnected to room {room_id}")
        else:
            # New connection
            connection_id = await self.register_connection(
                session_id, websocket, room_id, nickname, is_host
            )
            
            # Send player_joined message to others
            await self.send_sequenced_message(room_id, "player_joined", {
                "player": {
                    "id": session_id,
                    "nickname": nickname,
                    "isHost": is_host
                }
            }, exclude_session=session_id)
            
            logger.info(f"Session {session_id} joined room {room_id}")
        
        return connection_id
    
    async def register_connection(self, session_id: str, websocket: Any, 
                                 room_id: Optional[str] = None,
                                 nickname: Optional[str] = None,
                                 is_host: bool = False) -> str:
        """
        Register a new connection for a session.
        
        Returns:
            connection_id for this connection
        """
        connection_id = str(uuid.uuid4())
        now = time.time()
        
        # Check for existing connection for this session
        old_connection_id = self.session_to_connection.get(session_id)
        if old_connection_id:
            # Only close if it's a different websocket
            old_ws = self.websockets.get(old_connection_id)
            if old_ws and old_ws != websocket:
                logger.info(f"Closing old connection {old_connection_id} for session {session_id}")
                await self.disconnect_connection(old_connection_id, close_websocket=True)
            elif old_ws == websocket:
                # Same websocket, just update the connection
                logger.info(f"Same websocket for session {session_id}, updating connection")
                # Clean up old connection without closing websocket
                await self.disconnect_connection(old_connection_id, close_websocket=False, enter_grace=False)
        
        # Create connection info
        conn_info = ConnectionInfo(
            connection_id=connection_id,
            session_id=session_id,
            room_id=room_id,
            nickname=nickname,
            is_host=is_host,
            connected_at=now,
            last_ping=now,
            last_pong=now,
            last_ack_seq=0,
            state='active'
        )
        
        # Store locally
        self.connections[connection_id] = conn_info
        self.session_to_connection[session_id] = connection_id
        self.websockets[connection_id] = websocket
        
        # Update room connections for legacy compatibility
        if room_id:
            if room_id not in self.room_connections:
                self.room_connections[room_id] = {}
            self.room_connections[room_id][session_id] = websocket
        
        # Store in Redis
        await self._store_connection_redis(conn_info)
        
        # Start heartbeat
        self.heartbeat_tasks[connection_id] = asyncio.create_task(
            self._heartbeat_loop(connection_id)
        )
        
        logger.info(f"Registered connection {connection_id} for session {session_id} in room {room_id}, total connections: {len(self.connections)}")
        return connection_id
    
    async def handle_reconnect(self, session_id: str, websocket: Any, 
                              last_seq: int = 0, room_id: Optional[str] = None,
                              nickname: Optional[str] = None,
                              is_host: bool = False) -> Tuple[str, int]:
        """
        Handle a reconnecting session.
        
        Returns:
            Tuple of (connection_id, messages_to_replay_from_seq)
        """
        # Check if session was in grace period
        grace_info = await self._get_grace_period_info(session_id)
        
        if grace_info and grace_info.get('room_id'):
            # Session was in grace period, restore to same room
            room_id = grace_info['room_id']
            stored_last_seq = grace_info.get('last_ack_seq', 0)
            nickname = grace_info.get('nickname', nickname)
            is_host = grace_info.get('is_host', is_host)
            
            # Use the higher of client-reported and stored sequence
            resume_from_seq = max(last_seq, stored_last_seq)
            
            logger.info(f"Resuming session {session_id} from seq {resume_from_seq}")
        else:
            # Fresh connection
            resume_from_seq = last_seq
            logger.info(f"Fresh connection for session {session_id}")
        
        # Register new connection
        connection_id = await self.register_connection(
            session_id, websocket, room_id, nickname, is_host
        )
        
        # Update last ack sequence
        if resume_from_seq > 0:
            self.connections[connection_id].last_ack_seq = resume_from_seq
            await self._update_ack_sequence(session_id, resume_from_seq)
        
        return connection_id, resume_from_seq
    
    async def remove_from_room(self, session_id: str):
        """Remove session from its room (legacy interface)."""
        connection_id = self.session_to_connection.get(session_id)
        if connection_id:
            await self.disconnect_connection(connection_id, close_websocket=False, enter_grace=True)
    
    async def disconnect_session(self, session_id: str):
        """Disconnect a session and clean up (legacy interface)."""
        connection_id = self.session_to_connection.get(session_id)
        if connection_id:
            # Clean up sequencer tracking
            conn_info = self.connections.get(connection_id)
            if conn_info and conn_info.room_id:
                self.sequencer.remove_client(conn_info.room_id, session_id)
            
            await self.disconnect_connection(connection_id, close_websocket=False, enter_grace=True)
    
    async def disconnect_connection(self, connection_id: str, close_websocket: bool = False, 
                                   enter_grace: bool = True) -> None:
        """
        Disconnect a connection, optionally entering grace period.
        """
        conn_info = self.connections.get(connection_id)
        if not conn_info:
            return
        
        # Cancel heartbeat
        if connection_id in self.heartbeat_tasks:
            self.heartbeat_tasks[connection_id].cancel()
            del self.heartbeat_tasks[connection_id]
        
        # Close WebSocket if requested
        if close_websocket and connection_id in self.websockets:
            ws = self.websockets[connection_id]
            try:
                await ws.close()
            except:
                pass
            del self.websockets[connection_id]
        
        # Remove from room connections
        if conn_info.room_id and conn_info.room_id in self.room_connections:
            self.room_connections[conn_info.room_id].pop(conn_info.session_id, None)
            if not self.room_connections[conn_info.room_id]:
                del self.room_connections[conn_info.room_id]
        
        # Enter grace period or clean up
        if enter_grace and conn_info.state == 'active':
            await self._enter_grace_period(conn_info)
            
            # Send player_left message
            if conn_info.room_id:
                await self.send_sequenced_message(conn_info.room_id, "player_left", {
                    "session_id": conn_info.session_id
                })
        else:
            await self._cleanup_connection(connection_id)
    
    async def _enter_grace_period(self, conn_info: ConnectionInfo) -> None:
        """Put connection into grace period for potential reconnection."""
        conn_info.state = 'grace_period'
        grace_end = time.time() + self.grace_period
        
        # Store grace period info in Redis
        grace_key = f"grace:{conn_info.session_id}"
        grace_data = {
            'room_id': conn_info.room_id,
            'nickname': conn_info.nickname,
            'is_host': conn_info.is_host,
            'last_ack_seq': conn_info.last_ack_seq,
            'grace_end': grace_end
        }
        
        await self.redis.redis.setex(
            grace_key,
            int(self.grace_period),
            json.dumps(grace_data)
        )
        
        logger.info(f"Session {conn_info.session_id} entering grace period until {grace_end}")
        
        # Schedule cleanup after grace period
        asyncio.create_task(self._grace_period_cleanup(conn_info.session_id, grace_end))
    
    async def _grace_period_cleanup(self, session_id: str, grace_end: float) -> None:
        """Clean up after grace period expires."""
        # Wait for grace period
        wait_time = grace_end - time.time()
        if wait_time > 0:
            await asyncio.sleep(wait_time)
        
        # Check if session reconnected
        if session_id in self.session_to_connection:
            connection_id = self.session_to_connection[session_id]
            conn_info = self.connections.get(connection_id)
            if conn_info and conn_info.state == 'active':
                # Session reconnected, nothing to do
                return
        
        # Clean up grace period data
        await self.redis.redis.delete(f"grace:{session_id}")
        logger.info(f"Grace period expired for session {session_id}")
    
    async def _cleanup_connection(self, connection_id: str) -> None:
        """Fully clean up a connection."""
        conn_info = self.connections.get(connection_id)
        if not conn_info:
            return
        
        # Remove from local tracking
        if conn_info.session_id in self.session_to_connection:
            if self.session_to_connection[conn_info.session_id] == connection_id:
                del self.session_to_connection[conn_info.session_id]
        
        del self.connections[connection_id]
        
        # Clean up Redis
        await self._remove_connection_redis(conn_info.session_id)
        
        logger.info(f"Cleaned up connection {connection_id}")
    
    async def send_to_session(self, session_id: str, message: Dict):
        """Send message to specific session."""
        connection_id = self.session_to_connection.get(session_id)
        if not connection_id:
            logger.warning(f"No connection for session {session_id}")
            return
        
        # Check if connection is active
        conn_info = self.connections.get(connection_id)
        if not conn_info or conn_info.state != 'active':
            logger.warning(f"Connection {connection_id} is not active for session {session_id}")
            return
        
        websocket = self.websockets.get(connection_id)
        if not websocket:
            logger.warning(f"No websocket for connection {connection_id}")
            return
        
        try:
            await websocket.send_json(message)
            
            # Add to outbox for replay capability
            seq_num = message.get('seq_num')
            if seq_num:
                await self.add_to_outbox(session_id, seq_num, message)
        except Exception as e:
            logger.error(f"Error sending to session {session_id}: {e}")
            # Connection might be broken, disconnect it
            await self.disconnect_connection(connection_id, close_websocket=False, enter_grace=True)
    
    async def broadcast_to_room(self, room_id: str, message: Dict, exclude_session: Optional[str] = None):
        """Broadcast to all sessions in a room."""
        # Get all sessions in room from Redis
        room_sessions = await self.get_room_sessions_async(room_id)
        
        if not room_sessions:
            logger.warning(f"No sessions in room {room_id}")
            return
        
        disconnected = []
        
        for session_id in room_sessions:
            if session_id == exclude_session:
                continue
            
            try:
                await self.send_to_session(session_id, message)
            except Exception as e:
                logger.error(f"Error broadcasting to session {session_id}: {e}")
                disconnected.append(session_id)
        
        # Clean up disconnected sessions
        for session_id in disconnected:
            await self.disconnect_session(session_id)
    
    async def send_sequenced_message(self, room_id: str, message_type: str, data: Dict[str, Any], 
                                    exclude_session: Optional[str] = None):
        """Send a sequenced message to all clients in a room."""
        sequenced_msg = self.sequencer.add_message(room_id, message_type, data)
        message = sequenced_msg.to_dict()
        
        await self.broadcast_to_room(room_id, message, exclude_session)
    
    async def create_room_checkpoint(self, room_id: str, phase: str, data: Dict[str, Any]):
        """Create a checkpoint for a room and broadcast to all clients."""
        checkpoint = self.sequencer.create_checkpoint(room_id, phase, data)
        checkpoint_message = checkpoint.to_dict()
        
        # Broadcast checkpoint to all clients in room
        await self.broadcast_to_room(room_id, checkpoint_message)
        logger.info(f"Broadcasted checkpoint for room {room_id}, phase {phase}")
    
    async def acknowledge_sequence(self, room_id: str, session_id: str, seq_num: int):
        """Update client's acknowledged sequence number."""
        self.sequencer.set_client_sequence(room_id, session_id, seq_num)
        
        # Also update in connection tracker
        connection_id = self.session_to_connection.get(session_id)
        if connection_id:
            await self.handle_ack(connection_id, seq_num)
    
    async def synchronize_client(self, room_id: str, session_id: str) -> bool:
        """Send synchronization data to a reconnecting client."""
        sync_data = self.sequencer.get_synchronization_data(room_id, session_id)
        
        if "error" in sync_data:
            logger.warning(f"Cannot synchronize client {session_id} in room {room_id}: {sync_data['error']}")
            return False
        
        connection_id = self.session_to_connection.get(session_id)
        if not connection_id:
            logger.warning(f"No connection for session {session_id}")
            return False
        
        websocket = self.websockets.get(connection_id)
        if not websocket:
            logger.warning(f"No websocket for connection {connection_id}")
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
    
    async def send_session_info(self, session_id: str, room_id: str):
        """Send session info to a specific session."""
        from app.core.database import async_session_maker
        from app.models import UserSession
        from sqlalchemy import select
        
        async with async_session_maker() as db:
            # Get session info
            session_result = await db.execute(
                select(UserSession).where(UserSession.user_id == session_id)
            )
            session = session_result.scalar_one_or_none()
            
            if session:
                await self.send_to_session(session_id, {
                    "type": "session_info",
                    "session_id": session_id,
                    "nickname": session.nickname,
                    "room_id": room_id
                })
    
    # Heartbeat handling
    
    async def handle_ping(self, connection_id: str) -> None:
        """Handle incoming ping from client."""
        if connection_id in self.connections:
            self.connections[connection_id].last_pong = time.time()
    
    async def handle_pong(self, session_id: str) -> None:
        """Handle incoming pong from client (by session ID for compatibility)."""
        connection_id = self.session_to_connection.get(session_id)
        if connection_id:
            await self.handle_ping(connection_id)
    
    async def handle_ack(self, connection_id: str, seq_num: int) -> None:
        """Handle sequence acknowledgment from client."""
        conn_info = self.connections.get(connection_id)
        if conn_info and seq_num > conn_info.last_ack_seq:
            conn_info.last_ack_seq = seq_num
            await self._update_ack_sequence(conn_info.session_id, seq_num)
    
    async def _heartbeat_loop(self, connection_id: str) -> None:
        """Send periodic pings and check for timeouts."""
        try:
            while connection_id in self.connections:
                conn_info = self.connections[connection_id]
                ws = self.websockets.get(connection_id)
                
                if not ws:
                    break
                
                now = time.time()
                
                # Check for timeout
                if now - conn_info.last_pong > self.ping_timeout:
                    logger.warning(f"Connection {connection_id} timed out")
                    await self.disconnect_connection(connection_id, close_websocket=True, enter_grace=True)
                    break
                
                # Send ping
                try:
                    await ws.send_json({
                        'type': 'ping',
                        'timestamp': now
                    })
                    conn_info.last_ping = now
                except Exception as e:
                    logger.error(f"Failed to send ping to {connection_id}: {e}")
                    await self.disconnect_connection(connection_id, close_websocket=False, enter_grace=True)
                    break
                
                # Wait for next ping interval
                await asyncio.sleep(self.ping_interval)
                
        except asyncio.CancelledError:
            logger.debug(f"Heartbeat cancelled for {connection_id}")
        except Exception as e:
            logger.error(f"Heartbeat error for {connection_id}: {e}")
    
    # Redis operations
    
    async def _ensure_redis_connected(self) -> None:
        """Ensure Redis is connected."""
        if not self._redis_connected:
            await self.redis.ensure_connected()
            self._redis_connected = True
    
    async def _store_connection_redis(self, conn_info: ConnectionInfo) -> None:
        """Store connection info in Redis."""
        await self._ensure_redis_connected()
        
        # Store connection mapping
        conn_key = f"conn:{conn_info.session_id}"
        await self.redis.redis.setex(
            conn_key,
            300,  # 5 minute TTL
            json.dumps({
                'connection_id': conn_info.connection_id,
                'room_id': conn_info.room_id,
                'nickname': conn_info.nickname,
                'is_host': conn_info.is_host,
                'connected_at': conn_info.connected_at
            })
        )
        
        # Add to room presence if in a room
        if conn_info.room_id:
            presence_key = f"presence:{conn_info.room_id}"
            await self.redis.redis.sadd(presence_key, conn_info.session_id)
            await self.redis.redis.expire(presence_key, 3600)  # 1 hour TTL
    
    async def _remove_connection_redis(self, session_id: str) -> None:
        """Remove connection info from Redis."""
        # Get connection info first
        conn_key = f"conn:{session_id}"
        conn_data = await self.redis.redis.get(conn_key)
        
        if conn_data:
            conn_info = json.loads(conn_data)
            room_id = conn_info.get('room_id')
            
            # Remove from room presence
            if room_id:
                presence_key = f"presence:{room_id}"
                await self.redis.redis.srem(presence_key, session_id)
        
        # Delete connection mapping
        await self.redis.redis.delete(conn_key)
    
    async def _get_grace_period_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get grace period info for a session."""
        grace_key = f"grace:{session_id}"
        grace_data = await self.redis.redis.get(grace_key)
        
        if grace_data:
            return json.loads(grace_data)
        return None
    
    async def _update_ack_sequence(self, session_id: str, seq_num: int) -> None:
        """Update acknowledged sequence number in Redis."""
        cursor_key = f"cursor:{session_id}"
        await self.redis.redis.setex(cursor_key, 3600, seq_num)  # 1 hour TTL
    
    async def get_last_ack_sequence(self, session_id: str) -> int:
        """Get last acknowledged sequence for a session."""
        cursor_key = f"cursor:{session_id}"
        seq = await self.redis.redis.get(cursor_key)
        return int(seq) if seq else 0
    
    # Outbox operations
    
    async def add_to_outbox(self, session_id: str, seq_num: int, message: Dict[str, Any]) -> None:
        """Add message to session's outbox for potential replay."""
        outbox_key = f"outbox:{session_id}"
        
        # Add to Redis stream with automatic trimming
        await self.redis.redis.xadd(
            outbox_key,
            {'seq': seq_num, 'msg': json.dumps(message)},
            maxlen=self.outbox_size
        )
        
        # Set TTL
        await self.redis.redis.expire(outbox_key, 3600)  # 1 hour TTL
    
    async def get_messages_since(self, session_id: str, after_seq: int) -> list:
        """Get all messages after a given sequence number."""
        outbox_key = f"outbox:{session_id}"
        
        # Read all messages from stream
        messages = await self.redis.redis.xrange(outbox_key)
        
        result = []
        for msg_id, data in messages:
            seq = int(data.get('seq', 0))
            if seq > after_seq:
                msg = json.loads(data.get('msg', '{}'))
                result.append((seq, msg))
        
        # Sort by sequence number
        result.sort(key=lambda x: x[0])
        return result
    
    async def replay_messages(self, session_id: str, after_seq: int) -> None:
        """Replay messages to a session after a given sequence."""
        messages = await self.get_messages_since(session_id, after_seq)
        
        for seq, msg in messages:
            await self.send_to_session(session_id, msg)
            
        if messages:
            logger.info(f"Replayed {len(messages)} messages to session {session_id}")
    
    # Legacy compatibility methods
    
    def get_room_sessions(self, room_id: str) -> List[str]:
        """Get all session IDs in a room (synchronous for compatibility)."""
        # Return local cached version for now
        return list(self.room_connections.get(room_id, {}).keys())
    
    async def get_room_sessions_async(self, room_id: str) -> Set[str]:
        """Get all sessions in a room (from Redis)."""
        presence_key = f"presence:{room_id}"
        members = await self.redis.redis.smembers(presence_key)
        return set(members) if members else set()
    
    def get_session_room(self, session_id: str) -> Optional[str]:
        """Get the room ID for a session."""
        connection_id = self.session_to_connection.get(session_id)
        if connection_id:
            conn_info = self.connections.get(connection_id)
            return conn_info.room_id if conn_info else None
        return None
    
    def is_session_connected(self, session_id: str) -> bool:
        """Check if a session has an active connection."""
        connection_id = self.session_to_connection.get(session_id)
        if connection_id:
            conn_info = self.connections.get(connection_id)
            return conn_info and conn_info.state == 'active'
        return False
    
    def cleanup_room_sequencer(self, room_id: str):
        """Clean up sequencer data when room is deleted."""
        self.sequencer.cleanup_room(room_id)
    
    async def cleanup_all(self) -> None:
        """Clean up all connections (for shutdown)."""
        # Cancel all heartbeats
        for task in self.heartbeat_tasks.values():
            task.cancel()
        
        # Close all websockets
        for connection_id in list(self.connections.keys()):
            await self.disconnect_connection(connection_id, close_websocket=True, enter_grace=False)