import uuid
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from sqlalchemy.exc import IntegrityError
from app.models.session import UserSession


class SessionManager:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_session(self, nickname: str, ttl_days: int = 180) -> UserSession:
        """
        Create a new session for a user with the given nickname.
        Deactivates any existing sessions for the same user.
        """
        user_id = uuid.uuid4()
        token = uuid.uuid4()
        now = datetime.utcnow()
        expires_at = now + timedelta(days=ttl_days)

        # Check if a session already exists for this nickname and deactivate it
        # Since user_id is the primary key, we need to find existing sessions by nickname
        # and deactivate them to ensure only one active session per user
        existing_sessions = await self.session.execute(
            select(UserSession).where(
                UserSession.nickname == nickname,
                UserSession.is_active == True
            )
        )
        existing_sessions_list = existing_sessions.scalars().all()

        # Deactivate existing sessions
        for existing_session in existing_sessions_list:
            existing_session.is_active = False
            self.session.add(existing_session)

        # Create new session
        new_session = UserSession(
            user_id=user_id,
            nickname=nickname,
            token=token,
            created_at=now,
            expires_at=expires_at,
            last_accessed=now,
            is_active=True
        )

        self.session.add(new_session)
        await self.session.commit()
        await self.session.refresh(new_session)

        return new_session

    async def validate_session(self, token: uuid.UUID, refresh_threshold_days: int = 7) -> Optional[UserSession]:
        """
        Validate a session token and optionally refresh it if needed.
        Returns the session if valid, None if invalid or expired.
        """
        # Find active session by token
        result = await self.session.execute(
            select(UserSession).where(
                UserSession.token == token,
                UserSession.is_active == True
            )
        )
        session = result.scalar_one_or_none()

        if not session:
            return None

        # Check if session is expired
        if session.is_expired():
            # Mark session as inactive
            session.is_active = False
            self.session.add(session)
            await self.session.commit()
            return None

        # Update last accessed time
        session.last_accessed = datetime.utcnow()

        # Check if token needs refresh
        if session.needs_refresh(refresh_threshold_days):
            session.refresh_token()

        self.session.add(session)
        await self.session.commit()
        await self.session.refresh(session)

        return session

    async def get_session_by_token(self, token: uuid.UUID) -> Optional[UserSession]:
        """
        Retrieve an active session by token without updating last_accessed.
        """
        result = await self.session.execute(
            select(UserSession).where(
                UserSession.token == token,
                UserSession.is_active == True
            )
        )
        return result.scalar_one_or_none()

    async def get_session_by_user_id(self, user_id: uuid.UUID) -> Optional[UserSession]:
        """
        Retrieve an active session by user_id.
        """
        result = await self.session.execute(
            select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.is_active == True
            )
        )
        return result.scalar_one_or_none()

    async def update_nickname(self, user_id: uuid.UUID, new_nickname: str) -> Optional[UserSession]:
        """
        Update the nickname for a user's session without invalidating it.
        """
        result = await self.session.execute(
            select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.is_active == True
            )
        )
        session = result.scalar_one_or_none()

        if not session:
            return None

        session.nickname = new_nickname
        session.last_accessed = datetime.utcnow()

        self.session.add(session)
        await self.session.commit()
        await self.session.refresh(session)

        return session

    async def invalidate_session(self, token: uuid.UUID) -> bool:
        """
        Invalidate a session by marking it as inactive.
        Returns True if session was found and invalidated, False otherwise.
        """
        result = await self.session.execute(
            select(UserSession).where(
                UserSession.token == token,
                UserSession.is_active == True
            )
        )
        session = result.scalar_one_or_none()

        if not session:
            return False

        session.is_active = False
        self.session.add(session)
        await self.session.commit()

        return True

    async def invalidate_user_sessions(self, user_id: uuid.UUID) -> int:
        """
        Invalidate all sessions for a user.
        Returns the number of sessions invalidated.
        """
        result = await self.session.execute(
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.is_active == True)
            .values(is_active=False)
        )
        await self.session.commit()
        return result.rowcount

    async def cleanup_expired_sessions(self) -> int:
        """
        Remove expired and inactive sessions from the database.
        Returns the number of sessions cleaned up.
        """
        now = datetime.utcnow()

        # Delete sessions that are either inactive or expired
        result = await self.session.execute(
            delete(UserSession).where(
                (UserSession.is_active == False) | (
                    UserSession.expires_at < now)
            )
        )
        await self.session.commit()

        return result.rowcount

    async def refresh_session_token(self, user_id: uuid.UUID, ttl_days: int = 180) -> Optional[UserSession]:
        """
        Manually refresh a session token and extend expiration.
        """
        result = await self.session.execute(
            select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.is_active == True
            )
        )
        session = result.scalar_one_or_none()

        if not session:
            return None

        session.refresh_token(ttl_days)
        self.session.add(session)
        await self.session.commit()
        await self.session.refresh(session)

        return session
