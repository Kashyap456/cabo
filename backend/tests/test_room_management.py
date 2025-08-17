import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import UserSession, GameRoom, RoomState
from services.room_manager import RoomManager
import uuid
from datetime import datetime, timedelta


@pytest.mark.asyncio
async def test_create_room(async_session: AsyncSession):
    """Test creating a new room"""
    room_manager = RoomManager()
    
    # Create a test user session first
    test_session = UserSession(
        user_id=uuid.uuid4(),
        nickname="TestHost",
        token=uuid.uuid4(),
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=180),
        last_accessed=datetime.utcnow(),
        is_active=True
    )
    async_session.add(test_session)
    await async_session.commit()
    
    # Create a room
    room = await room_manager.create_room(
        async_session,
        str(test_session.user_id),
        {"max_players": 4}
    )
    
    assert room is not None
    assert len(room.room_code) == 6
    assert room.state == RoomState.WAITING
    assert room.host_session_id == test_session.user_id
    assert room.config["max_players"] == 4


@pytest.mark.asyncio
async def test_join_room(async_session: AsyncSession):
    """Test joining an existing room"""
    room_manager = RoomManager()
    
    # Create host session
    host_session = UserSession(
        user_id=uuid.uuid4(),
        nickname="Host",
        token=uuid.uuid4(),
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=180),
        last_accessed=datetime.utcnow(),
        is_active=True
    )
    async_session.add(host_session)
    
    # Create player session
    player_session = UserSession(
        user_id=uuid.uuid4(),
        nickname="Player",
        token=uuid.uuid4(),
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=180),
        last_accessed=datetime.utcnow(),
        is_active=True
    )
    async_session.add(player_session)
    await async_session.commit()
    
    # Create room
    room = await room_manager.create_room(
        async_session,
        str(host_session.user_id),
        {}
    )
    
    # Join room
    joined_room = await room_manager.join_room(
        async_session,
        room.room_code,
        str(player_session.user_id)
    )
    
    assert joined_room is not None
    assert joined_room.room_code == room.room_code
    
    # Verify player is in room
    players = await room_manager.get_room_players(async_session, room.room_id)
    assert len(players) == 2
    player_ids = [str(p.user_id) for p in players]
    assert str(host_session.user_id) in player_ids
    assert str(player_session.user_id) in player_ids


@pytest.mark.asyncio
async def test_leave_room_host_migration(async_session: AsyncSession):
    """Test that host migration happens when host leaves"""
    room_manager = RoomManager()
    
    # Create sessions
    host_session = UserSession(
        user_id=uuid.uuid4(),
        nickname="Host",
        token=uuid.uuid4(),
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=180),
        last_accessed=datetime.utcnow(),
        is_active=True
    )
    player_session = UserSession(
        user_id=uuid.uuid4(),
        nickname="Player",
        token=uuid.uuid4(),
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=180),
        last_accessed=datetime.utcnow(),
        is_active=True
    )
    async_session.add(host_session)
    async_session.add(player_session)
    await async_session.commit()
    
    # Create room and join
    room = await room_manager.create_room(
        async_session,
        str(host_session.user_id),
        {}
    )
    await room_manager.join_room(
        async_session,
        room.room_code,
        str(player_session.user_id)
    )
    
    # Host leaves
    new_host_id = await room_manager.leave_room(
        async_session,
        str(host_session.user_id)
    )
    
    # Verify host migration
    assert new_host_id == str(player_session.user_id)
    
    # Check room still exists with new host
    updated_room = await room_manager.get_room(async_session, room.room_code)
    assert updated_room is not None
    assert updated_room.host_session_id == player_session.user_id


@pytest.mark.asyncio
async def test_start_game_requires_minimum_players(async_session: AsyncSession):
    """Test that game requires minimum players to start"""
    room_manager = RoomManager()
    
    # Create host session
    host_session = UserSession(
        user_id=uuid.uuid4(),
        nickname="Host",
        token=uuid.uuid4(),
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=180),
        last_accessed=datetime.utcnow(),
        is_active=True
    )
    async_session.add(host_session)
    await async_session.commit()
    
    # Create room with min_players = 2
    room = await room_manager.create_room(
        async_session,
        str(host_session.user_id),
        {"min_players": 2}
    )
    
    # Try to start with only 1 player (should fail)
    with pytest.raises(ValueError, match="Need at least 2 players"):
        await room_manager.start_game(
            async_session,
            room.room_code,
            str(host_session.user_id)
        )
    
    # Add another player
    player_session = UserSession(
        user_id=uuid.uuid4(),
        nickname="Player",
        token=uuid.uuid4(),
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=180),
        last_accessed=datetime.utcnow(),
        is_active=True
    )
    async_session.add(player_session)
    await async_session.commit()
    
    await room_manager.join_room(
        async_session,
        room.room_code,
        str(player_session.user_id)
    )
    
    # Now should be able to start
    started_room = await room_manager.start_game(
        async_session,
        room.room_code,
        str(host_session.user_id)
    )
    
    assert started_room.state == RoomState.IN_GAME
    assert started_room.game_started_at is not None