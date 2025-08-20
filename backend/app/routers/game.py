from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
import uuid
import logging

from app.core.database import get_db
from app.middleware.session import get_current_session
from app.models import UserSession, GameRoom
from services.room_manager import RoomManager, AlreadyInRoomError
from services.game_orchestrator import GameOrchestrator
from services.connection_manager import ConnectionManager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rooms", tags=["rooms"])
room_manager = RoomManager()

# These will be initialized from main app
game_orchestrator: Optional[GameOrchestrator] = None
connection_manager: Optional[ConnectionManager] = None


class CreateRoomRequest(BaseModel):
    config: Optional[Dict[str, Any]] = None


class CreateRoomResponse(BaseModel):
    room_code: str
    room_id: str
    host_session_id: str


class JoinRoomResponse(BaseModel):
    success: bool
    room: Dict[str, Any]


class RoomResponse(BaseModel):
    room: Dict[str, Any]
    players: List[Dict[str, Any]]


class UpdateConfigRequest(BaseModel):
    config: Dict[str, Any]


class RoomConflictResponse(BaseModel):
    error_type: str = "already_in_room"
    message: str
    current_room: Dict[str, Any]


def serialize_player(session: UserSession, room: GameRoom) -> Dict[str, Any]:
    """Convert UserSession to JSON-serializable dict for room context"""
    return {
        "user_id": str(session.user_id),
        "nickname": session.nickname,
        "isHost": session.user_id == room.host_session_id
    }


def serialize_room(room: GameRoom) -> Dict[str, Any]:
    """Convert GameRoom to JSON-serializable dict"""
    return {
        "room_id": str(room.room_id),
        "room_code": room.room_code,
        "phase": room.phase.value,
        "config": room.config,
        "host_session_id": str(room.host_session_id) if room.host_session_id else None,
        "created_at": room.created_at.isoformat() if room.created_at else None,
        "last_activity": room.last_activity.isoformat() if room.last_activity else None,
        "game_started_at": room.game_started_at.isoformat() if room.game_started_at else None,
        "player_count": room.session_count,
        "players": [serialize_player(p, room) for p in room.sessions]
    }


@router.post("/", response_model=CreateRoomResponse)
async def create_room(
    request: CreateRoomRequest,
    db: AsyncSession = Depends(get_db),
    current_session: UserSession = Depends(get_current_session)
):
    """Create a new game room"""
    try:
        room = await room_manager.create_room(
            db,
            str(current_session.user_id),
            request.config
        )

        return CreateRoomResponse(
            room_code=room.room_code,
            room_id=str(room.room_id),
            host_session_id=str(room.host_session_id)
        )
    except AlreadyInRoomError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error_type": "already_in_room",
                "message": str(e),
                "current_room": serialize_room(e.current_room)
            }
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/{room_code}/join", response_model=JoinRoomResponse)
async def join_room(
    room_code: str,
    db: AsyncSession = Depends(get_db),
    current_session: UserSession = Depends(get_current_session)
):
    """Join an existing room"""
    try:
        room = await room_manager.join_room(
            db,
            room_code.upper(),  # Normalize to uppercase
            str(current_session.user_id)
        )
        return JoinRoomResponse(
            success=True,
            room=serialize_room(room)
        )
    except AlreadyInRoomError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error_type": "already_in_room",
                "message": str(e),
                "current_room": serialize_room(e.current_room)
            }
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/{room_code}/leave")
async def leave_room(
    room_code: str,
    db: AsyncSession = Depends(get_db),
    current_session: UserSession = Depends(get_current_session)
):
    """Leave the current room"""
    try:
        new_host_id = await room_manager.leave_room(
            db,
            str(current_session.user_id)
        )
        return {
            "success": True,
            "new_host_id": str(new_host_id) if new_host_id else None
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/{room_code}", response_model=RoomResponse)
async def get_room(
    room_code: str,
    db: AsyncSession = Depends(get_db),
    current_session: UserSession = Depends(get_current_session)
):
    """Get room information"""
    room = await room_manager.get_room(db, room_code.upper())

    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    # Check if user is in the room
    # Check if user is in this room
    from app.models import UserToRoom
    membership_result = await db.execute(
        select(UserToRoom).where(
            UserToRoom.user_id == current_session.user_id,
            UserToRoom.room_id == room.room_id
        )
    )
    if not membership_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not in this room")

    players = await room_manager.get_room_players(db, room.room_id)

    return RoomResponse(
        room=serialize_room(room),
        players=[serialize_player(p) for p in players]
    )


@router.post("/{room_code}/start")
async def start_game(
    room_code: str,
    db: AsyncSession = Depends(get_db),
    current_session: UserSession = Depends(get_current_session)
):
    """Start the game (host only)"""
    try:
        room = await room_manager.start_game(
            db,
            room_code.upper(),
            str(current_session.user_id)
        )

        # Create CaboGame instance via GameOrchestrator
        if game_orchestrator:
            logger.info(f"Creating game for room {room.room_id}")
            players = await room_manager.get_room_players(db, room.room_id)
            await game_orchestrator.create_game(room, players, db)
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Game orchestrator not found")

        return {
            "success": True,
            "room": serialize_room(room)
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.patch("/{room_code}/config")
async def update_room_config(
    room_code: str,
    request: UpdateConfigRequest,
    db: AsyncSession = Depends(get_db),
    current_session: UserSession = Depends(get_current_session)
):
    """Update room configuration (host only)"""
    try:
        room = await room_manager.update_room_config(
            db,
            room_code.upper(),
            str(current_session.user_id),
            request.config
        )
        return {
            "success": True,
            "room": serialize_room(room)
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


def set_game_orchestrator(orchestrator: GameOrchestrator):
    """Set the game orchestrator instance (called from main app setup)"""
    global game_orchestrator
    game_orchestrator = orchestrator


def set_connection_manager(manager: ConnectionManager):
    """Set the connection manager instance (called from main app setup)"""
    global connection_manager
    connection_manager = manager
