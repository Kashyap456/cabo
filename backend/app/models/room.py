from enum import Enum
from sqlalchemy import Column, String, JSON, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.core.database import Base


class RoomPhase(Enum):
    WAITING = "WAITING"
    IN_GAME = "IN_GAME"
    FINISHED = "FINISHED"


class GameRoom(Base):
    __tablename__ = "game_rooms"

    room_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_code = Column(String(6), unique=True, index=True, nullable=False)
    config = Column(JSON, nullable=False, default={})
    phase = Column(SQLEnum(RoomPhase),
                   default=RoomPhase.WAITING, nullable=False)
    host_session_id = Column(
        UUID(as_uuid=True), ForeignKey("user_sessions.user_id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    last_activity = Column(DateTime, default=datetime.utcnow)
    game_started_at = Column(DateTime, nullable=True)

    # Relationships
    user_memberships = relationship(
        "UserToRoom", back_populates="room", cascade="all, delete-orphan")
    host = relationship(
        "UserSession", back_populates="hosted_rooms", foreign_keys=[host_session_id])

    @property
    def sessions(self):
        """Get all user sessions in this room"""
        return [membership.user for membership in self.user_memberships]

    @property
    def session_count(self):
        """Get the number of users in this room"""
        return len(self.user_memberships)
