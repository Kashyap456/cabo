from enum import Enum
from sqlalchemy import Column, String, JSON, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.core.database import Base


class RoomState(Enum):
    WAITING = "WAITING"
    IN_GAME = "IN_GAME"
    FINISHED = "FINISHED"


class GameRoom(Base):
    __tablename__ = "game_rooms"
    
    room_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_code = Column(String(6), unique=True, index=True, nullable=False)
    config = Column(JSON, nullable=False, default={})
    state = Column(SQLEnum(RoomState), default=RoomState.WAITING, nullable=False)
    host_session_id = Column(UUID(as_uuid=True), ForeignKey("user_sessions.user_id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    last_activity = Column(DateTime, default=datetime.utcnow)
    game_started_at = Column(DateTime, nullable=True)
    
    # Relationships
    sessions = relationship("UserSession", back_populates="room", foreign_keys="UserSession.room_id")
    host = relationship("UserSession", foreign_keys=[host_session_id])