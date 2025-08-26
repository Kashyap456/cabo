import json
import logging
import asyncio
from typing import Dict, Optional, List, Tuple
from datetime import datetime
import redis.asyncio as redis

logger = logging.getLogger(__name__)


class StreamManager:
    """
    Manages Redis Streams for game events and player position tracking.
    Uses regular XREAD for broadcast (NOT consumer groups).
    """
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        # room_id -> last broadcast position
        self.broadcast_positions: Dict[str, str] = {}
        # room_id -> broadcast task
        self.broadcast_tasks: Dict[str, asyncio.Task] = {}
    
    async def publish_event(self, room_id: str, event_type: str, data: dict) -> str:
        """Publish an event to the room's stream"""
        stream_key = f"stream:game:{room_id}:events"
        
        # Add metadata
        event_data = {
            "event_type": event_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Add to stream
        event_id = await self.redis.xadd(
            stream_key,
            {"event": json.dumps(event_data)}
        )
        
        logger.debug(f"Published {event_type} to room {room_id} stream at {event_id}")
        return event_id
    
    async def start_broadcast(self, room_id: str, connection_manager, from_position: str = "$"):
        """Start broadcasting events from stream to all room members"""
        if room_id in self.broadcast_tasks:
            logger.warning(f"Broadcast already running for room {room_id}")
            return
        
        self.broadcast_positions[room_id] = from_position
        self.broadcast_tasks[room_id] = asyncio.create_task(
            self._broadcast_loop(room_id, connection_manager)
        )
        logger.info(f"Started broadcast for room {room_id} from {from_position}")
    
    async def _broadcast_loop(self, room_id: str, connection_manager):
        """Read from stream and broadcast to all connections"""
        stream_key = f"stream:game:{room_id}:events"
        last_id = self.broadcast_positions[room_id]
        
        try:
            while room_id in self.broadcast_tasks:
                try:
                    # Read new events (NOT using consumer groups)
                    result = await self.redis.xread(
                        {stream_key: last_id},
                        count=10,
                        block=100  # Block for 100ms
                    )
                    
                    if not result:
                        continue
                    
                    for stream_name, events in result:
                        for msg_id, data in events:
                            try:
                                if not data:
                                    continue
                                
                                # Since decode_responses=True, we get strings not bytes
                                event_json = data.get('event', '{}')
                                
                                if event_json == '{}':
                                    continue
                                    
                                try:
                                    event_data = json.loads(event_json)
                                except json.JSONDecodeError:
                                    logger.error(f"Failed to parse event JSON: {event_json[:100]}")
                                    continue
                                
                                if not event_data or not event_data.get('event_type'):
                                    continue
                                
                                # Add stream position to event
                                event_data['stream_id'] = msg_id
                                
                                # Get next sequence number
                                seq_num = connection_manager.get_next_sequence(room_id)
                                event_data['seq_num'] = seq_num
                                
                                # Broadcast to ALL players
                                await connection_manager.broadcast_to_room(
                                    room_id,
                                    {
                                        "type": "game_event",
                                        **event_data
                                    }
                                )
                                
                                last_id = msg_id
                                self.broadcast_positions[room_id] = last_id
                                
                            except Exception as e:
                                logger.error(f"Failed to broadcast event {msg_id}: {e}")
                                last_id = msg_id
                
                except Exception as e:
                    logger.error(f"Error in broadcast loop for {room_id}: {e}")
                    await asyncio.sleep(1)
        
        except asyncio.CancelledError:
            logger.info(f"Broadcast loop cancelled for room {room_id}")
        finally:
            self.broadcast_tasks.pop(room_id, None)
            self.broadcast_positions.pop(room_id, None)
    
    async def stop_broadcast(self, room_id: str):
        """Stop broadcasting for a room"""
        task = self.broadcast_tasks.get(room_id)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            logger.info(f"Stopped broadcast for room {room_id}")
    
    async def get_player_position(self, room_id: str, session_id: str) -> Optional[str]:
        """Get a player's last acknowledged stream position"""
        key = f"player_stream_pos:{room_id}:{session_id}"
        pos = await self.redis.get(key)
        return pos.decode() if pos else None
    
    async def update_player_position(self, room_id: str, session_id: str, stream_id: str):
        """Update a player's stream position"""
        key = f"player_stream_pos:{room_id}:{session_id}"
        await self.redis.set(key, stream_id, ex=86400)  # Expire after 1 day
    
    async def get_events_since(
        self, 
        room_id: str, 
        since_position: str,
        limit: int = 1000
    ) -> List[Tuple[str, dict]]:
        """Get all events after a given position"""
        stream_key = f"stream:game:{room_id}:events"
        
        result = await self.redis.xrange(
            stream_key,
            min=f"({since_position}",  # Exclusive
            max="+",
            count=limit
        )
        
        events = []
        for msg_id, data in result:
            try:
                # Since decode_responses=True, we get strings not bytes
                event_data = json.loads(data.get('event', '{}'))
                events.append((msg_id, event_data))
            except Exception as e:
                logger.error(f"Failed to parse event {msg_id}: {e}")
        
        return events
    
    async def cleanup_stream(self, room_id: str):
        """Clean up stream data for a room"""
        stream_key = f"stream:game:{room_id}:events"
        
        # Stop broadcast if running
        await self.stop_broadcast(room_id)
        
        # Delete the stream
        try:
            await self.redis.delete(stream_key)
            logger.info(f"Deleted stream for room {room_id}")
        except Exception as e:
            logger.error(f"Failed to delete stream for room {room_id}: {e}")