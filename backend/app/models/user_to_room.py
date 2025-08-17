import uuid
from datetime import datetime
from sqlalchemy import ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class UserToRoom(Base):
    """Join table for many-to-many relationship between users and rooms"""
    __tablename__ = "user_to_room"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_sessions.user_id"),
        nullable=False
    )
    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game_rooms.room_id"),
        nullable=False
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow
    )

    # Relationships
    user = relationship(
        "UserSession", back_populates="room_memberships")
    room = relationship(
        "GameRoom", back_populates="user_memberships")

    __table_args__ = (
        UniqueConstraint('user_id', 'room_id', name='uq_user_room'),
    )
