import os
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timedelta
from sqlalchemy.exc import IntegrityError
from app.models.session import UserSession
from services.session_manager import SessionManager


@pytest_asyncio.fixture
async def session_manager(async_session):
    """Create session manager instance"""
    return SessionManager(async_session)


class TestSessionManager:
    """Test cases for SessionManager"""

    async def test_create_session(self, session_manager):
        """Test creating a new session"""
        nickname = "test_user"
        session = await session_manager.create_session(nickname)

        assert session.nickname == nickname
        assert session.is_active is True
        assert isinstance(session.user_id, uuid.UUID)
        assert isinstance(session.token, uuid.UUID)
        assert isinstance(session.created_at, datetime)
        assert isinstance(session.expires_at, datetime)
        assert session.expires_at > session.created_at

    async def test_create_session_deactivates_existing(self, session_manager):
        """Test that creating a new session deactivates existing ones for the same nickname"""
        nickname = "test_user"

        # Create first session
        session1 = await session_manager.create_session(nickname)
        assert session1.is_active is True

        # Create second session with same nickname
        session2 = await session_manager.create_session(nickname)
        assert session2.is_active is True

        # Check that first session is deactivated
        old_session = await session_manager.get_session_by_token(session1.token)
        assert old_session is None or old_session.is_active is False

    async def test_validate_session_valid(self, session_manager):
        """Test validating a valid session"""
        nickname = "test_user"
        session = await session_manager.create_session(nickname)

        # Validate the session
        validated_session = await session_manager.validate_session(session.token)

        assert validated_session is not None
        assert validated_session.user_id == session.user_id
        assert validated_session.nickname == nickname
        assert validated_session.is_active is True

    async def test_validate_session_invalid_token(self, session_manager):
        """Test validating with invalid token"""
        invalid_token = uuid.uuid4()

        validated_session = await session_manager.validate_session(invalid_token)
        assert validated_session is None

    async def test_validate_session_expired(self, session_manager, async_session):
        """Test validating an expired session"""
        nickname = "test_user"
        session = await session_manager.create_session(nickname)

        # Manually expire the session
        session.expires_at = datetime.utcnow() - timedelta(hours=1)
        async_session.add(session)
        await async_session.commit()

        # Try to validate expired session
        validated_session = await session_manager.validate_session(session.token)
        assert validated_session is None

        # Check that session was marked as inactive
        expired_session = await session_manager.get_session_by_token(session.token)
        assert expired_session is None

    async def test_validate_session_refresh_needed(self, session_manager, async_session):
        """Test that session token is refreshed when TTL is low"""
        nickname = "test_user"
        session = await session_manager.create_session(nickname)
        original_token = session.token
        original_expires_at = session.expires_at

        # Set expires_at to be within refresh threshold (5 days from now)
        session.expires_at = datetime.utcnow() + timedelta(days=5)
        async_session.add(session)
        await async_session.commit()

        # Validate session with refresh threshold of 7 days
        validated_session = await session_manager.validate_session(session.token, refresh_threshold_days=7)

        assert validated_session is not None
        assert validated_session.token != original_token  # Token should be refreshed
        assert validated_session.expires_at > original_expires_at  # Expiration extended

    async def test_get_session_by_token(self, session_manager):
        """Test retrieving session by token"""
        nickname = "test_user"
        session = await session_manager.create_session(nickname)

        retrieved_session = await session_manager.get_session_by_token(session.token)

        assert retrieved_session is not None
        assert retrieved_session.user_id == session.user_id
        assert retrieved_session.nickname == nickname

    async def test_get_session_by_user_id(self, session_manager):
        """Test retrieving session by user_id"""
        nickname = "test_user"
        session = await session_manager.create_session(nickname)

        retrieved_session = await session_manager.get_session_by_user_id(session.user_id)

        assert retrieved_session is not None
        assert retrieved_session.user_id == session.user_id
        assert retrieved_session.nickname == nickname

    async def test_update_nickname(self, session_manager):
        """Test updating session nickname"""
        original_nickname = "test_user"
        new_nickname = "updated_user"

        session = await session_manager.create_session(original_nickname)

        updated_session = await session_manager.update_nickname(session.user_id, new_nickname)

        assert updated_session is not None
        assert updated_session.nickname == new_nickname
        assert updated_session.user_id == session.user_id
        assert updated_session.token == session.token  # Token should remain the same

    async def test_update_nickname_nonexistent_user(self, session_manager):
        """Test updating nickname for non-existent user"""
        fake_user_id = uuid.uuid4()
        new_nickname = "updated_user"

        result = await session_manager.update_nickname(fake_user_id, new_nickname)
        assert result is None

    async def test_invalidate_session(self, session_manager):
        """Test invalidating a session"""
        nickname = "test_user"
        session = await session_manager.create_session(nickname)

        # Invalidate the session
        result = await session_manager.invalidate_session(session.token)
        assert result is True

        # Try to retrieve the session
        invalidated_session = await session_manager.get_session_by_token(session.token)
        assert invalidated_session is None

    async def test_invalidate_nonexistent_session(self, session_manager):
        """Test invalidating a non-existent session"""
        fake_token = uuid.uuid4()

        result = await session_manager.invalidate_session(fake_token)
        assert result is False

    async def test_single_session_constraint_enforced(self, session_manager, async_session):
        s1 = await session_manager.create_session("u")
        s2 = await session_manager.create_session("v")
        # Attempt to violate invariant should error
        s2.user_id = s1.user_id
        async_session.add(s2)
        with pytest.raises(IntegrityError):
            await async_session.flush()

    async def test_cleanup_expired_sessions(self, session_manager, async_session):
        """Test cleaning up expired and inactive sessions"""
        # Create active session
        active_session = await session_manager.create_session("active_user")

        # Create expired session
        expired_session = await session_manager.create_session("expired_user")
        expired_session.expires_at = datetime.utcnow() - timedelta(hours=1)
        async_session.add(expired_session)

        # Create inactive session
        inactive_session = await session_manager.create_session("inactive_user")
        inactive_session.is_active = False
        async_session.add(inactive_session)

        await async_session.commit()

        # Run cleanup
        cleanup_count = await session_manager.cleanup_expired_sessions()

        # Should clean up at least the expired and inactive sessions
        assert cleanup_count >= 2

        # Active session should still exist
        remaining_session = await session_manager.get_session_by_token(active_session.token)
        assert remaining_session is not None

    async def test_refresh_session_token(self, session_manager):
        """Test manually refreshing a session token"""
        nickname = "test_user"
        session = await session_manager.create_session(nickname)
        original_token = session.token
        original_expires_at = session.expires_at

        # Refresh the token
        refreshed_session = await session_manager.refresh_session_token(session.user_id)

        assert refreshed_session is not None
        assert refreshed_session.token != original_token
        assert refreshed_session.expires_at > original_expires_at
        assert refreshed_session.user_id == session.user_id
        assert refreshed_session.nickname == session.nickname

    async def test_refresh_nonexistent_session_token(self, session_manager):
        """Test refreshing token for non-existent session"""
        fake_user_id = uuid.uuid4()

        result = await session_manager.refresh_session_token(fake_user_id)
        assert result is None


class TestUserSessionModel:
    """Test cases for UserSession model methods"""

    def test_is_expired_false(self):
        """Test is_expired returns False for active session"""
        session = UserSession(
            user_id=uuid.uuid4(),
            nickname="test",
            token=uuid.uuid4(),
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=1),
            last_accessed=datetime.utcnow(),
            is_active=True
        )

        assert session.is_expired() is False

    def test_is_expired_true(self):
        """Test is_expired returns True for expired session"""
        session = UserSession(
            user_id=uuid.uuid4(),
            nickname="test",
            token=uuid.uuid4(),
            created_at=datetime.utcnow() - timedelta(days=2),
            expires_at=datetime.utcnow() - timedelta(days=1),
            last_accessed=datetime.utcnow() - timedelta(days=1),
            is_active=True
        )

        assert session.is_expired() is True

    def test_needs_refresh_true(self):
        """Test needs_refresh returns True when TTL is low"""
        session = UserSession(
            user_id=uuid.uuid4(),
            nickname="test",
            token=uuid.uuid4(),
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=5),  # 5 days left
            last_accessed=datetime.utcnow(),
            is_active=True
        )

        assert session.needs_refresh(refresh_threshold_days=7) is True

    def test_needs_refresh_false(self):
        """Test needs_refresh returns False when TTL is sufficient"""
        session = UserSession(
            user_id=uuid.uuid4(),
            nickname="test",
            token=uuid.uuid4(),
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=10),  # 10 days left
            last_accessed=datetime.utcnow(),
            is_active=True
        )

        assert session.needs_refresh(refresh_threshold_days=7) is False

    def test_refresh_token(self):
        """Test refresh_token method updates token and expiration"""
        session = UserSession(
            user_id=uuid.uuid4(),
            nickname="test",
            token=uuid.uuid4(),
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=1),
            last_accessed=datetime.utcnow(),
            is_active=True
        )

        original_token = session.token
        original_expires_at = session.expires_at

        session.refresh_token(ttl_days=180)

        assert session.token != original_token
        assert session.expires_at > original_expires_at
        assert isinstance(session.token, uuid.UUID)
