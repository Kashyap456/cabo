import uuid
from datetime import datetime, timedelta
from sqlalchemy import String, Boolean, DateTime, Index, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    nickname: Mapped[str] = mapped_column(String(100), nullable=False)
    token: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        unique=True,
        default=uuid.uuid4,
        index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.utcnow() + timedelta(days=180)
    )
    last_accessed: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True
    )
    # Relationships
    room_memberships = relationship(
        "UserToRoom", back_populates="user", cascade="all, delete-orphan")
    hosted_rooms = relationship(
        "GameRoom", back_populates="host", foreign_keys="GameRoom.host_session_id")

    __table_args__ = (
        Index('ix_user_sessions_token_active', 'token', 'is_active'),
        Index('ix_user_sessions_expires_at', 'expires_at'),
    )

    def is_expired(self) -> bool:
        """Check if the session is expired"""
        return datetime.utcnow() > self.expires_at

    def needs_refresh(self, refresh_threshold_days: int = 7) -> bool:
        """Check if the session needs token refresh based on remaining TTL"""
        remaining_time = self.expires_at - datetime.utcnow()
        return remaining_time.days < refresh_threshold_days

    def refresh_token(self, ttl_days: int = 180) -> None:
        """Refresh the session token and extend expiration"""
        self.token = uuid.uuid4()
        self.expires_at = datetime.utcnow() + timedelta(days=ttl_days)
        self.last_accessed = datetime.utcnow()

    def get_current_room(self):
        """Get the current room this user is in (assumes user can only be in one room at a time)"""
        if hasattr(self, '_room_memberships_loaded') and self.room_memberships:
            return self.room_memberships[0].room
        return None

    def get_current_room_id(self):
        """Get the current room ID this user is in"""
        if hasattr(self, '_room_memberships_loaded') and self.room_memberships:
            return self.room_memberships[0].room_id
        return None
