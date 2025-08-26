from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Any, Optional
import json
import logging

logger = logging.getLogger(__name__)


@dataclass
class GameCheckpoint:
    """Room-wide checkpoint with complete state and visibility map"""
    checkpoint_id: str
    room_id: str
    stream_position: str  # Position in Redis stream
    sequence_num: int
    phase: str
    game_state: Dict[str, Any]  # Complete state including visibility
    timestamp: datetime
    
    def to_dict(self) -> dict:
        return {
            "type": "game_checkpoint",
            "checkpoint_id": self.checkpoint_id,
            "room_id": self.room_id,
            "stream_position": self.stream_position,
            "sequence_num": self.sequence_num,
            "phase": self.phase,
            "game_state": self.game_state,
            "timestamp": self.timestamp.isoformat()
        }


class CheckpointManager:
    """Manages room-wide game checkpoints in Redis"""
    
    def __init__(self, redis_client):
        self.redis = redis_client
    
    async def create_checkpoint(
        self, 
        room_id: str, 
        game: 'CaboGame',
        sequence_num: int
    ) -> GameCheckpoint:
        """Create room-wide checkpoint with complete game state and visibility"""
        
        # Get current stream position
        stream_key = f"stream:game:{room_id}:events"
        try:
            stream_info = await self.redis.xinfo_stream(stream_key)
            stream_position = stream_info[b'last-generated-id'].decode()
        except:
            stream_position = "0"  # Stream doesn't exist yet
        
        # Get complete game state with visibility map
        game_state = game.get_complete_game_state()
        
        checkpoint = GameCheckpoint(
            checkpoint_id=f"{room_id}:{sequence_num}:{datetime.utcnow().timestamp()}",
            room_id=room_id,
            stream_position=stream_position,
            sequence_num=sequence_num,
            phase=game.state.phase.value,
            game_state=game_state,
            timestamp=datetime.utcnow()
        )
        
        # Store latest checkpoint
        checkpoint_key = f"checkpoint:{room_id}:latest"
        await self.redis.set(
            checkpoint_key,
            json.dumps(checkpoint.to_dict()),
            ex=86400 * 7  # 7 days
        )
        
        # Also store in history (keep last 10)
        history_key = f"checkpoint:{room_id}:history"
        await self.redis.lpush(history_key, json.dumps(checkpoint.to_dict()))
        await self.redis.ltrim(history_key, 0, 9)
        
        logger.info(
            f"Created checkpoint {checkpoint.checkpoint_id} at stream position {stream_position} "
            f"for phase {checkpoint.phase}"
        )
        
        return checkpoint
    
    async def get_latest_checkpoint(self, room_id: str) -> Optional[GameCheckpoint]:
        """Get the latest checkpoint for a room"""
        checkpoint_key = f"checkpoint:{room_id}:latest"
        data = await self.redis.get(checkpoint_key)
        
        if not data:
            logger.warning(f"No checkpoint found for room {room_id}")
            return None
        
        checkpoint_dict = json.loads(data)
        return GameCheckpoint(
            checkpoint_id=checkpoint_dict['checkpoint_id'],
            room_id=checkpoint_dict['room_id'],
            stream_position=checkpoint_dict['stream_position'],
            sequence_num=checkpoint_dict['sequence_num'],
            phase=checkpoint_dict['phase'],
            game_state=checkpoint_dict['game_state'],
            timestamp=datetime.fromisoformat(checkpoint_dict['timestamp'])
        )
    
    async def cleanup_checkpoints(self, room_id: str):
        """Clean up all checkpoints for a room"""
        try:
            # Delete latest checkpoint
            await self.redis.delete(f"checkpoint:{room_id}:latest")
            
            # Delete history
            await self.redis.delete(f"checkpoint:{room_id}:history")
            
            logger.info(f"Cleaned up checkpoints for room {room_id}")
        except Exception as e:
            logger.error(f"Failed to cleanup checkpoints for room {room_id}: {e}")