from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime
import json
import logging

logger = logging.getLogger(__name__)


@dataclass
class SequencedMessage:
    """A message with sequence number and timestamp"""
    seq_num: int
    timestamp: datetime
    message_type: str
    data: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "seq_num": self.seq_num,
            "timestamp": self.timestamp.isoformat(),
            "type": self.message_type,
            **self.data
        }


@dataclass
class RoomCheckpoint:
    """A checkpoint representing complete room state at a point in time"""
    seq_num: int
    timestamp: datetime
    phase: str  # WAITING, PLAYING, ENDED
    data: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": f"room_{self.phase.lower()}_state",
            "seq_num": self.seq_num,
            "timestamp": self.timestamp.isoformat(),
            **self.data
        }


class MessageSequencer:
    """Manages sequence numbers, message buffering, and checkpoints per room"""

    def __init__(self, max_buffer_size: int = 1000):
        # Room ID -> current sequence number
        self.room_sequences: Dict[str, int] = {}

        # Room ID -> list of sequenced messages since last checkpoint
        self.message_buffers: Dict[str, List[SequencedMessage]] = {}

        # Room ID -> latest checkpoint (for WAITING phase)
        self.checkpoints: Dict[str, RoomCheckpoint] = {}

        # Room ID -> Session ID -> personalized checkpoint (for IN_GAME phase)
        self.player_checkpoints: Dict[str, Dict[str, RoomCheckpoint]] = {}

        # Room ID -> Session ID -> last acknowledged sequence number
        self.client_sequences: Dict[str, Dict[str, int]] = {}

        self.max_buffer_size = max_buffer_size

    def get_next_sequence(self, room_id: str) -> int:
        """Get the next sequence number for a room"""
        current = self.room_sequences.get(room_id, 0)
        next_seq = current + 1
        self.room_sequences[room_id] = next_seq
        return next_seq

    def create_checkpoint(self, room_id: str, phase: str, data: Dict[str, Any]) -> RoomCheckpoint:
        """Create a new checkpoint for the room, clearing message buffer"""
        seq_num = self.get_next_sequence(room_id)
        timestamp = datetime.utcnow()

        checkpoint = RoomCheckpoint(
            seq_num=seq_num,
            timestamp=timestamp,
            phase=phase,
            data=data
        )

        # Store checkpoint and clear buffer
        self.checkpoints[room_id] = checkpoint
        self.message_buffers[room_id] = []

        logger.info(
            f"Created checkpoint for room {room_id} at seq {seq_num}, phase {phase}")
        return checkpoint

    def add_message(self, room_id: str, message_type: str, data: Dict[str, Any]) -> SequencedMessage:
        """Add a sequenced message to the room buffer"""
        seq_num = self.get_next_sequence(room_id)
        timestamp = datetime.utcnow()

        message = SequencedMessage(
            seq_num=seq_num,
            timestamp=timestamp,
            message_type=message_type,
            data=data
        )

        # Ensure buffer exists
        if room_id not in self.message_buffers:
            self.message_buffers[room_id] = []

        # Add to buffer
        self.message_buffers[room_id].append(message)

        # Trim buffer if too large (keep recent messages)
        if len(self.message_buffers[room_id]) > self.max_buffer_size:
            self.message_buffers[room_id] = self.message_buffers[room_id][-self.max_buffer_size:]

        logger.debug(
            f"Added message to room {room_id}: {message_type} seq {seq_num}")
        return message

    def create_player_checkpoint(self, room_id: str, session_id: str, phase: str, data: Dict[str, Any], increment_seq: bool = False) -> RoomCheckpoint:
        """Create a new personalized checkpoint for a specific player"""
        # Use current sequence number without incrementing (unless explicitly requested)
        if increment_seq:
            seq_num = self.get_next_sequence(room_id)
        else:
            seq_num = self.room_sequences.get(room_id, 0)
        
        timestamp = datetime.utcnow()

        checkpoint = RoomCheckpoint(
            seq_num=seq_num,
            timestamp=timestamp,
            phase=phase,
            data=data
        )

        # Store player-specific checkpoint
        if room_id not in self.player_checkpoints:
            self.player_checkpoints[room_id] = {}
        self.player_checkpoints[room_id][session_id] = checkpoint

        logger.info(
            f"Created player checkpoint for session {session_id} in room {room_id} at seq {seq_num}, phase {phase}")
        return checkpoint

    def get_checkpoint(self, room_id: str) -> Optional[RoomCheckpoint]:
        """Get the latest checkpoint for a room"""
        return self.checkpoints.get(room_id)

    def get_player_checkpoint(self, room_id: str, session_id: str) -> Optional[RoomCheckpoint]:
        """Get the latest personalized checkpoint for a player"""
        return self.player_checkpoints.get(room_id, {}).get(session_id)

    def get_messages_since(self, room_id: str, since_seq: int) -> List[SequencedMessage]:
        """Get all messages since a specific sequence number"""
        buffer = self.message_buffers.get(room_id, [])
        return [msg for msg in buffer if msg.seq_num > since_seq]

    def set_client_sequence(self, room_id: str, session_id: str, seq_num: int):
        """Update the last acknowledged sequence number for a client"""
        if room_id not in self.client_sequences:
            self.client_sequences[room_id] = {}

        self.client_sequences[room_id][session_id] = seq_num
        logger.debug(
            f"Client {session_id} in room {room_id} acked seq {seq_num}")
        
        # Clean up old messages from buffer if all clients have acknowledged them
        self._cleanup_acknowledged_messages(room_id)

    def get_client_sequence(self, room_id: str, session_id: str) -> int:
        """Get the last acknowledged sequence number for a client (0 if new)"""
        return self.client_sequences.get(room_id, {}).get(session_id, 0)

    def remove_client(self, room_id: str, session_id: str):
        """Remove client tracking when they disconnect"""
        if room_id in self.client_sequences:
            self.client_sequences[room_id].pop(session_id, None)

            # Clean up empty room tracking
            if not self.client_sequences[room_id]:
                del self.client_sequences[room_id]

    def cleanup_room(self, room_id: str):
        """Clean up all data for a room when it's deleted"""
        self.room_sequences.pop(room_id, None)
        self.message_buffers.pop(room_id, None)
        self.checkpoints.pop(room_id, None)
        self.player_checkpoints.pop(room_id, None)
        self.client_sequences.pop(room_id, None)

        logger.info(f"Cleaned up sequencer data for room {room_id}")

    def get_synchronization_data(self, room_id: str, session_id: str) -> Dict[str, Any]:
        """Get the data needed to synchronize a client (checkpoint + missing messages)"""
        # Try to get player-specific checkpoint first (for IN_GAME)
        checkpoint = self.get_player_checkpoint(room_id, session_id)

        # Fall back to room checkpoint (for WAITING)
        if not checkpoint:
            checkpoint = self.get_checkpoint(room_id)

        if not checkpoint:
            return {"error": "No checkpoint available"}

        # Get client's last known sequence
        client_seq = self.get_client_sequence(room_id, session_id)

        # Get messages since client's last sequence
        missing_messages = self.get_messages_since(room_id, client_seq)

        return {
            "checkpoint": checkpoint.to_dict(),
            "messages": [msg.to_dict() for msg in missing_messages],
            "current_seq": self.room_sequences.get(room_id, 0)
        }
    
    def _cleanup_acknowledged_messages(self, room_id: str):
        """Remove messages that all clients have acknowledged"""
        if room_id not in self.client_sequences or room_id not in self.message_buffers:
            return
        
        client_sequences = self.client_sequences[room_id]
        if not client_sequences:
            return
        
        # Find the minimum acknowledged sequence across all clients
        min_acked_seq = min(client_sequences.values())
        
        # Keep only messages after the minimum acknowledged sequence
        original_buffer = self.message_buffers[room_id]
        self.message_buffers[room_id] = [
            msg for msg in original_buffer if msg.seq_num > min_acked_seq
        ]
        
        cleaned_count = len(original_buffer) - len(self.message_buffers[room_id])
        if cleaned_count > 0:
            logger.debug(f"Cleaned {cleaned_count} acknowledged messages from room {room_id} buffer")
