import random
import string
from datetime import datetime
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload

from app.models import GameRoom, UserSession, RoomState, UserToRoom


class AlreadyInRoomError(Exception):
    """Exception raised when a user is already in a room"""

    def __init__(self, message: str, current_room: GameRoom):
        super().__init__(message)
        self.current_room = current_room


@dataclass
class RoomConfig:
    max_players: int = 6
    min_players: int = 2
    timeout_seconds: int = 600  # Room expires after 10 minutes of inactivity
    allow_spectators: bool = False


class RoomManager:
    def __init__(self):
        self.code_chars = string.ascii_uppercase + string.digits

    def generate_room_code(self) -> str:
        """Generate a unique 6-character alphanumeric room code"""
        return ''.join(random.choices(self.code_chars, k=6))

    async def create_room(self, db: AsyncSession, host_session_id: str, config: Optional[Dict[str, Any]] = None) -> GameRoom:
        """Create a new game room with the host"""
        # Find the host session
        result = await db.execute(
            select(UserSession).where(UserSession.user_id == host_session_id)
        )
        host_session = result.scalar_one_or_none()

        if not host_session:
            raise ValueError(f"Session {host_session_id} not found")

        # Check if host is already in a room
        existing_membership = await db.execute(
            select(UserToRoom).where(
                UserToRoom.user_id == host_session.user_id)
        )
        membership = existing_membership.scalar_one_or_none()
        if membership:
            # Get the current room information with relationships loaded
            current_room_result = await db.execute(
                select(GameRoom)
                .options(selectinload(GameRoom.user_memberships))
                .where(GameRoom.room_id == membership.room_id)
            )
            current_room = current_room_result.scalar_one_or_none()
            if current_room:
                raise AlreadyInRoomError(
                    f"Session {host_session_id} is already in a room", current_room)
            else:
                # Clean up stale membership
                await db.execute(delete(UserToRoom).where(UserToRoom.user_id == host_session.user_id))
                await db.commit()

        # Generate unique room code
        room_code = None
        for _ in range(10):  # Try 10 times to generate unique code
            code = self.generate_room_code()
            result = await db.execute(
                select(GameRoom).where(GameRoom.room_code == code)
            )
            if not result.scalar_one_or_none():
                room_code = code
                break

        if not room_code:
            raise ValueError("Could not generate unique room code")

        # Create room config
        room_config = config or {}
        if 'max_players' not in room_config:
            room_config['max_players'] = 6
        if 'min_players' not in room_config:
            room_config['min_players'] = 2

        # Create the room
        room = GameRoom(
            room_code=room_code,
            config=room_config,
            state=RoomState.WAITING,
            host_session_id=host_session_id,
            created_at=datetime.utcnow(),
            last_activity=datetime.utcnow()
        )

        db.add(room)
        await db.flush()  # Get the room_id

        # Create join table entry for host
        user_to_room = UserToRoom(
            user_id=host_session.user_id,
            room_id=room.room_id,
            joined_at=datetime.utcnow()
        )
        db.add(user_to_room)

        await db.commit()
        return room

    async def join_room(self, db: AsyncSession, room_code: str, session_id: str) -> GameRoom:
        """Join an existing room"""
        # Find the room
        result = await db.execute(
            select(GameRoom)
            .options(selectinload(GameRoom.user_memberships))
            .where(GameRoom.room_code == room_code)
        )
        room = result.scalar_one_or_none()

        if not room:
            raise ValueError(f"Room {room_code} not found")

        if room.state != RoomState.WAITING:
            raise ValueError(f"Room {room_code} is not accepting new players")

        # Find the session
        result = await db.execute(
            select(UserSession).where(UserSession.user_id == session_id)
        )
        session = result.scalar_one_or_none()

        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Check if session is already in a room
        existing_membership = await db.execute(
            select(UserToRoom).where(UserToRoom.user_id == session.user_id)
        )
        membership = existing_membership.scalar_one_or_none()
        if membership:
            # Get the current room information with relationships loaded
            current_room_result = await db.execute(
                select(GameRoom)
                .options(selectinload(GameRoom.user_memberships))
                .where(GameRoom.room_id == membership.room_id)
            )
            current_room = current_room_result.scalar_one_or_none()
            if current_room:
                raise AlreadyInRoomError(
                    f"Session {session_id} is already in a room", current_room)
            else:
                # Clean up stale membership
                await db.execute(delete(UserToRoom).where(UserToRoom.user_id == session.user_id))
                await db.commit()

        # Check room capacity
        current_players = room.session_count
        max_players = room.config.get('max_players', 6)

        if current_players >= max_players:
            raise ValueError(f"Room {room_code} is full")

        # Create join table entry
        user_to_room = UserToRoom(
            user_id=session.user_id,
            room_id=room.room_id,
            joined_at=datetime.utcnow()
        )
        db.add(user_to_room)
        room.last_activity = datetime.utcnow()

        await db.commit()
        return room

    async def leave_room(self, db: AsyncSession, session_id: str) -> Optional[str]:
        """Leave the current room. Returns new host_id if host migration happened"""
        # Find the session
        result = await db.execute(
            select(UserSession).where(UserSession.user_id == session_id)
        )
        session = result.scalar_one_or_none()

        if not session:
            return None

        # Find the room membership
        membership_result = await db.execute(
            select(UserToRoom).where(UserToRoom.user_id == session.user_id)
        )
        membership = membership_result.scalar_one_or_none()

        if not membership:
            return None

        room_id = membership.room_id

        # Find the room
        result = await db.execute(
            select(GameRoom)
            .options(selectinload(GameRoom.user_memberships))
            .where(GameRoom.room_id == room_id)
        )
        room = result.scalar_one_or_none()

        if not room:
            # Clean up any stale join table entries
            await db.execute(
                delete(UserToRoom).where(UserToRoom.user_id == session_id)
            )
            await db.commit()
            return None

        # Remove from room by deleting join table entry
        await db.execute(
            delete(UserToRoom).where(
                UserToRoom.user_id == session_id,
                UserToRoom.room_id == room_id
            )
        )

        # Check if this was the host
        new_host_id = None
        if room.host_session_id == session_id:
            # Find a new host
            remaining_sessions = [
                membership.user for membership in room.user_memberships if membership.user.user_id != session_id]
            if remaining_sessions:
                new_host = remaining_sessions[0]
                room.host_session_id = new_host.user_id
                new_host_id = new_host.user_id
            else:
                # No one left, delete the room
                await db.delete(room)

        room.last_activity = datetime.utcnow()
        await db.commit()

        return new_host_id

    async def start_game(self, db: AsyncSession, room_code: str, session_id: str) -> GameRoom:
        """Start a game in the room (host only)"""
        # Find the room
        result = await db.execute(
            select(GameRoom)
            .options(selectinload(GameRoom.user_memberships))
            .where(GameRoom.room_code == room_code)
        )
        room = result.scalar_one_or_none()

        if not room:
            raise ValueError(f"Room {room_code} not found")

        if str(room.host_session_id) != str(session_id):
            raise ValueError("Only the host can start the game")

        if room.state != RoomState.WAITING:
            raise ValueError(f"Room {room_code} is not in waiting state")

        # Check minimum players
        current_players = room.session_count
        min_players = room.config.get('min_players', 2)

        if current_players < min_players:
            raise ValueError(f"Need at least {min_players} players to start")

        # Start the game
        room.state = RoomState.IN_GAME
        room.game_started_at = datetime.utcnow()
        room.last_activity = datetime.utcnow()

        await db.commit()
        return room

    async def get_room(self, db: AsyncSession, room_code: str) -> Optional[GameRoom]:
        """Get room by code"""
        result = await db.execute(
            select(GameRoom)
            .options(selectinload(GameRoom.user_memberships))
            .where(GameRoom.room_code == room_code)
        )
        return result.scalar_one_or_none()

    async def get_room_by_id(self, db: AsyncSession, room_id: str) -> Optional[GameRoom]:
        """Get room by ID"""
        result = await db.execute(
            select(GameRoom)
            .options(selectinload(GameRoom.user_memberships))
            .where(GameRoom.room_id == room_id)
        )
        return result.scalar_one_or_none()

    async def get_room_players(self, db: AsyncSession, room_id: str) -> List[UserSession]:
        """Get all sessions in a room"""
        result = await db.execute(
            select(UserSession)
            .join(UserToRoom)
            .where(UserToRoom.room_id == room_id)
        )
        return result.scalars().all()

    async def update_room_config(self, db: AsyncSession, room_code: str, session_id: str, config: Dict[str, Any]) -> GameRoom:
        """Update room configuration (host only)"""
        room = await self.get_room(db, room_code)

        if not room:
            raise ValueError(f"Room {room_code} not found")

        if room.host_session_id != session_id:
            raise ValueError("Only the host can update room configuration")

        if room.state != RoomState.WAITING:
            raise ValueError(
                "Cannot update configuration after game has started")

        # Update config
        room.config = {**room.config, **config}
        room.last_activity = datetime.utcnow()

        await db.commit()
        return room

    async def cleanup_expired_rooms(self, db: AsyncSession, timeout_seconds: int = 600) -> int:
        """Remove rooms that have been inactive for too long"""
        cutoff_time = datetime.utcnow().timestamp() - timeout_seconds
        cutoff_datetime = datetime.fromtimestamp(cutoff_time)

        # Find expired rooms
        result = await db.execute(
            select(GameRoom).where(
                GameRoom.last_activity < cutoff_datetime,
                GameRoom.state == RoomState.WAITING
            )
        )
        expired_rooms = result.scalars().all()

        # Delete join table entries and rooms
        for room in expired_rooms:
            await db.execute(
                delete(UserToRoom).where(UserToRoom.room_id == room.room_id)
            )
            await db.delete(room)

        await db.commit()
        return len(expired_rooms)
