from datetime import datetime
from sqlalchemy import Column, Integer, JSON, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.core.database import Base


class GameCheckpoint(Base):
    __tablename__ = "game_checkpoints"

    checkpoint_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("game_rooms.room_id"), 
                     nullable=False, index=True, unique=True)
    game_state = Column(JSON, nullable=False)
    sequence_number = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, 
                       onupdate=datetime.utcnow, nullable=False)

    # Relationships
    room = relationship("GameRoom", foreign_keys=[room_id])

    def __repr__(self):
        return f"<GameCheckpoint(room_id={self.room_id}, seq={self.sequence_number}, active={self.is_active})>"