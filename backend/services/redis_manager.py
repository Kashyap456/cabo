import redis.asyncio as redis
from redis.asyncio import Redis
from redis.exceptions import RedisError, ConnectionError
import logging
import os
from typing import Optional, Dict, Any, List
import json
import asyncio
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)


class RedisManager:
    """Manages Redis connections and provides high-level operations for game state management"""
    
    def __init__(self, url: Optional[str] = None):
        self.url = url or os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self._redis: Optional[Redis] = None
        self._pool = None
        self._lock = asyncio.Lock()
        
    async def connect(self) -> None:
        """Initialize Redis connection pool"""
        if self._redis:
            return
            
        async with self._lock:
            if self._redis:  # Double-check after acquiring lock
                return
                
            try:
                self._pool = redis.ConnectionPool.from_url(
                    self.url,
                    max_connections=50,
                    decode_responses=True,
                    health_check_interval=30
                )
                self._redis = redis.Redis(connection_pool=self._pool)
                
                # Test connection
                await self._redis.ping()
                logger.info(f"Connected to Redis at {self.url}")
                
            except (RedisError, ConnectionError) as e:
                logger.error(f"Failed to connect to Redis: {e}")
                raise
    
    async def disconnect(self) -> None:
        """Close Redis connection pool"""
        if self._redis:
            await self._redis.close()
            self._redis = None
        if self._pool:
            await self._pool.disconnect()
            self._pool = None
            
    @property
    def redis(self) -> Redis:
        """Get Redis client instance"""
        if not self._redis:
            raise RuntimeError("Redis not connected. Call connect() first.")
        return self._redis
    
    async def ensure_connected(self) -> None:
        """Ensure Redis is connected, reconnect if necessary"""
        if not self._redis:
            await self.connect()
        else:
            try:
                await self._redis.ping()
            except (RedisError, ConnectionError):
                logger.warning("Redis connection lost, reconnecting...")
                await self.disconnect()
                await self.connect()
    
    @asynccontextmanager
    async def pipeline(self, transaction: bool = True):
        """Create a Redis pipeline for batch operations"""
        await self.ensure_connected()
        async with self._redis.pipeline(transaction=transaction) as pipe:
            yield pipe
    
    @asynccontextmanager
    async def lock(self, name: str, timeout: int = 10, blocking_timeout: float = 5):
        """Distributed lock using Redis"""
        await self.ensure_connected()
        lock = self._redis.lock(f"lock:{name}", timeout=timeout, blocking_timeout=blocking_timeout)
        try:
            await lock.acquire()
            yield lock
        finally:
            try:
                await lock.release()
            except:
                pass  # Lock may have expired
    
    # Game State Operations
    
    async def save_game_meta(self, room_id: str, meta: Dict[str, Any]) -> None:
        """Save game metadata"""
        await self.ensure_connected()
        key = f"game:{room_id}:meta"
        await self._redis.hset(key, mapping={
            k: json.dumps(v) if isinstance(v, (dict, list)) else str(v)
            for k, v in meta.items()
        })
        await self._redis.expire(key, 86400)  # 24 hour TTL
    
    async def get_game_meta(self, room_id: str) -> Optional[Dict[str, Any]]:
        """Get game metadata"""
        await self.ensure_connected()
        key = f"game:{room_id}:meta"
        data = await self._redis.hgetall(key)
        if not data:
            return None
            
        # Parse JSON fields
        for field in ['pending_timeouts']:
            if field in data:
                try:
                    data[field] = json.loads(data[field])
                except json.JSONDecodeError:
                    pass
                    
        return data
    
    async def save_player(self, room_id: str, player_id: str, player_data: Dict[str, Any]) -> None:
        """Save player data"""
        await self.ensure_connected()
        key = f"game:{room_id}:player:{player_id}"
        await self._redis.hset(key, mapping={
            k: json.dumps(v) if isinstance(v, (dict, list)) else str(v)
            for k, v in player_data.items()
        })
        await self._redis.expire(key, 86400)
    
    async def get_player(self, room_id: str, player_id: str) -> Optional[Dict[str, Any]]:
        """Get player data"""
        await self.ensure_connected()
        key = f"game:{room_id}:player:{player_id}"
        data = await self._redis.hgetall(key)
        if not data:
            return None
            
        # Parse hand as JSON
        if 'hand' in data:
            data['hand'] = json.loads(data['hand'])
        if 'has_called_cabo' in data:
            data['has_called_cabo'] = data['has_called_cabo'] == 'True'
            
        return data
    
    async def get_all_players(self, room_id: str) -> List[Dict[str, Any]]:
        """Get all players in a game"""
        await self.ensure_connected()
        pattern = f"game:{room_id}:player:*"
        player_keys = []
        async for key in self._redis.scan_iter(pattern):
            player_keys.append(key)
        
        players = []
        for key in player_keys:
            player_id = key.split(":")[-1]
            player_data = await self.get_player(room_id, player_id)
            if player_data:
                player_data['player_id'] = player_id
                players.append(player_data)
                
        return players
    
    async def save_deck(self, room_id: str, cards: List[Dict[str, Any]]) -> None:
        """Save deck to Redis list"""
        await self.ensure_connected()
        key = f"game:{room_id}:deck"
        
        async with self.pipeline() as pipe:
            await pipe.delete(key)
            for card in cards:
                await pipe.rpush(key, json.dumps(card))
            await pipe.expire(key, 86400)
            await pipe.execute()
    
    async def get_deck(self, room_id: str) -> List[Dict[str, Any]]:
        """Get deck from Redis"""
        await self.ensure_connected()
        key = f"game:{room_id}:deck"
        cards = await self._redis.lrange(key, 0, -1)
        return [json.loads(card) for card in cards]
    
    async def draw_card(self, room_id: str) -> Optional[Dict[str, Any]]:
        """Draw a card from the deck (atomic operation)"""
        await self.ensure_connected()
        key = f"game:{room_id}:deck"
        card_json = await self._redis.rpop(key)
        return json.loads(card_json) if card_json else None
    
    async def save_discard_pile(self, room_id: str, cards: List[Dict[str, Any]]) -> None:
        """Save discard pile"""
        await self.ensure_connected()
        key = f"game:{room_id}:discard"
        
        async with self.pipeline() as pipe:
            await pipe.delete(key)
            for card in cards:
                await pipe.rpush(key, json.dumps(card))
            await pipe.expire(key, 86400)
            await pipe.execute()
    
    async def get_discard_pile(self, room_id: str) -> List[Dict[str, Any]]:
        """Get discard pile"""
        await self.ensure_connected()
        key = f"game:{room_id}:discard"
        cards = await self._redis.lrange(key, 0, -1)
        return [json.loads(card) for card in cards]
    
    async def save_turn_state(self, room_id: str, turn_data: Dict[str, Any]) -> None:
        """Save current turn state"""
        await self.ensure_connected()
        key = f"game:{room_id}:turn"
        
        # Convert complex objects to JSON
        serialized = {}
        for k, v in turn_data.items():
            if v is None:
                continue
            elif isinstance(v, (dict, list)):
                serialized[k] = json.dumps(v)
            else:
                serialized[k] = str(v)
        
        if serialized:
            await self._redis.hset(key, mapping=serialized)
            await self._redis.expire(key, 86400)
    
    async def get_turn_state(self, room_id: str) -> Dict[str, Any]:
        """Get current turn state"""
        await self.ensure_connected()
        key = f"game:{room_id}:turn"
        data = await self._redis.hgetall(key)
        
        # Parse JSON fields
        for field in ['drawn_card', 'played_card', 'king_viewed_card']:
            if field in data and data[field] and data[field] != 'None':
                try:
                    data[field] = json.loads(data[field])
                except json.JSONDecodeError:
                    pass
                    
        return data
    
    async def save_viewed_cards(self, room_id: str, viewer_id: str, cards: List[tuple]) -> None:
        """Save temporarily viewed cards for a player"""
        await self.ensure_connected()
        key = f"game:{room_id}:viewed:{viewer_id}"
        
        async with self.pipeline() as pipe:
            await pipe.delete(key)
            for owner_id, card_index in cards:
                await pipe.sadd(key, f"{owner_id}:{card_index}")
            await pipe.expire(key, 86400)
            await pipe.execute()
    
    async def get_viewed_cards(self, room_id: str, viewer_id: str) -> set:
        """Get temporarily viewed cards for a player"""
        await self.ensure_connected()
        key = f"game:{room_id}:viewed:{viewer_id}"
        members = await self._redis.smembers(key)
        
        result = set()
        for member in members:
            if ':' in member:
                owner_id, card_index = member.split(':', 1)
                result.add((owner_id, int(card_index)))
                
        return result
    
    # Message Queue Operations
    
    async def push_message(self, room_id: str, message: Dict[str, Any]) -> None:
        """Push message to game queue"""
        await self.ensure_connected()
        key = f"queue:game:{room_id}:messages"
        await self._redis.lpush(key, json.dumps(message))
        await self._redis.expire(key, 3600)  # 1 hour TTL for queues
    
    async def pop_message(self, room_id: str, timeout: float = 0.1) -> Optional[Dict[str, Any]]:
        """Pop message from game queue (blocking)"""
        await self.ensure_connected()
        key = f"queue:game:{room_id}:messages"
        
        result = await self._redis.brpop(key, timeout=timeout)
        if result:
            _, message = result
            return json.loads(message)
        return None
    
    # Event Stream Operations
    
    async def publish_event(self, room_id: str, event: Dict[str, Any]) -> str:
        """Publish event to Redis stream"""
        await self.ensure_connected()
        stream_key = f"stream:game:{room_id}:events"
        
        event_id = await self._redis.xadd(
            stream_key,
            {"event": json.dumps(event), "timestamp": str(event.get('timestamp', ''))}
        )
        
        # Trim stream to last 1000 events
        await self._redis.xtrim(stream_key, maxlen=1000, approximate=True)
        
        return event_id
    
    async def read_events(self, room_id: str, last_id: str = '0', count: int = 100) -> List[tuple]:
        """Read events from stream"""
        await self.ensure_connected()
        stream_key = f"stream:game:{room_id}:events"
        
        events = await self._redis.xread(
            {stream_key: last_id},
            count=count,
            block=None
        )
        
        result = []
        for stream_name, stream_events in events:
            for event_id, data in stream_events:
                event_data = json.loads(data['event'])
                result.append((event_id, event_data))
                
        return result
    
    # Connection Tracking
    
    async def track_connection(self, room_id: str, session_id: str) -> None:
        """Track active connection"""
        await self.ensure_connected()
        key = f"connections:{room_id}"
        await self._redis.hset(key, session_id, str(asyncio.get_event_loop().time()))
        await self._redis.expire(key, 3600)
    
    async def remove_connection(self, room_id: str, session_id: str) -> None:
        """Remove connection tracking"""
        await self.ensure_connected()
        key = f"connections:{room_id}"
        await self._redis.hdel(key, session_id)
    
    async def get_connections(self, room_id: str) -> Dict[str, float]:
        """Get all active connections for a room"""
        await self.ensure_connected()
        key = f"connections:{room_id}"
        data = await self._redis.hgetall(key)
        return {k: float(v) for k, v in data.items()}
    
    # Sequence Management
    
    async def get_next_sequence(self, room_id: str) -> int:
        """Get next sequence number (atomic increment)"""
        await self.ensure_connected()
        key = f"sequence:{room_id}:counter"
        seq = await self._redis.incr(key)
        await self._redis.expire(key, 86400)
        return seq
    
    async def ack_sequence(self, room_id: str, session_id: str, seq_num: int) -> None:
        """Acknowledge sequence number for a session"""
        await self.ensure_connected()
        key = f"sequence:{room_id}:acks"
        await self._redis.zadd(key, {session_id: seq_num})
        await self._redis.expire(key, 86400)
    
    async def get_last_ack(self, room_id: str, session_id: str) -> Optional[int]:
        """Get last acknowledged sequence for a session"""
        await self.ensure_connected()
        key = f"sequence:{room_id}:acks"
        score = await self._redis.zscore(key, session_id)
        return int(score) if score else None
    
    # Cleanup Operations
    
    async def cleanup_game(self, room_id: str) -> None:
        """Remove all data for a game"""
        await self.ensure_connected()
        
        # Find all keys for this game
        patterns = [
            f"game:{room_id}:*",
            f"queue:game:{room_id}:*",
            f"stream:game:{room_id}:*",
            f"sequence:{room_id}:*",
            f"connections:{room_id}",
            f"lock:game:{room_id}:*"
        ]
        
        keys_to_delete = []
        for pattern in patterns:
            async for key in self._redis.scan_iter(pattern):
                keys_to_delete.append(key)
        
        # Delete in batches
        if keys_to_delete:
            batch_size = 100
            for i in range(0, len(keys_to_delete), batch_size):
                batch = keys_to_delete[i:i + batch_size]
                await self._redis.delete(*batch)
        
        logger.info(f"Cleaned up {len(keys_to_delete)} keys for room {room_id}")
    
    async def get_active_games(self) -> List[str]:
        """Get list of all active game room IDs"""
        await self.ensure_connected()
        
        room_ids = set()
        async for key in self._redis.scan_iter("game:*:meta"):
            # Extract room_id from key pattern game:{room_id}:meta
            parts = key.split(":")
            if len(parts) >= 3:
                room_id = parts[1]
                room_ids.add(room_id)
        
        return list(room_ids)
    
    async def is_game_active(self, room_id: str) -> bool:
        """Check if a game exists in Redis"""
        await self.ensure_connected()
        key = f"game:{room_id}:meta"
        return await self._redis.exists(key) > 0


# Global instance
redis_manager = RedisManager()