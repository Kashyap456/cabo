from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, Cookie
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging
import json
from typing import Optional

from app.core.database import get_db, async_session_maker
from app.models import UserSession, GameRoom, UserToRoom
from app.models.room import RoomPhase
from services.connection_manager import ConnectionManager
from services.room_manager import RoomManager

logger = logging.getLogger(__name__)
ws_router = APIRouter()

# These will be initialized from main app
connection_manager: Optional[ConnectionManager] = None
room_manager = RoomManager()
game_orchestrator = None


async def authenticate_websocket(websocket: WebSocket, token: str, db: AsyncSession) -> Optional[UserSession]:
    """Authenticate WebSocket connection using session token"""
    if not token:
        return None

    # Find session by token
    result = await db.execute(
        select(UserSession).where(
            UserSession.token == token,
            UserSession.is_active == True
        )
    )
    session = result.scalar_one_or_none()

    if not session or session.is_expired():
        return None

    # Update last accessed time
    session.last_accessed = session.last_accessed
    await db.commit()

    return session


async def send_room_state(room: GameRoom, db: AsyncSession):
    """Send room state to all players (for waiting rooms)"""
    # Get all players in room
    players = await room_manager.get_room_players(db, room.room_id)

    room_state = {
        "type": "room_update",
        "room": {
            "room_id": str(room.room_id),
            "room_code": room.room_code,
            "config": room.config,
            "host_session_id": str(room.host_session_id) if room.host_session_id else None,
            "players": [
                {
                    "id": str(p.user_id),
                    "nickname": p.nickname,
                    "isHost": str(p.user_id) == str(room.host_session_id)
                }
                for p in players
            ]
        }
    }

    await connection_manager.broadcast_to_room(str(room.room_id), room_state)


# Checkpoint logic removed - now handled by GameOrchestrator with unified visibility
# The GameOrchestrator sends complete game state with visibility map
# Frontend filters based on visibility rules


@ws_router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    session_token: str = Cookie(...),
):
    """WebSocket endpoint for real-time game communication"""
    from app.core.database import async_session_maker

    logger.info(
        f"New WebSocket connection from {websocket.client.host}:{websocket.client.port}")

    session = None
    session_id = None
    connection_id = None
    room_id = None  # Cache room ID to avoid repeated queries

    try:
        # Authenticate with a temporary DB connection
        async with async_session_maker() as db:
            session = await authenticate_websocket(websocket, session_token, db)
            if not session:
                await websocket.close(code=4001, reason="Unauthorized")
                return

            session_id = str(session.user_id)

        # Accept connection
        await websocket.accept()
        logger.info(
            f"WebSocket connection accepted for session {session_id} from {websocket.client}")

        # Check if session is in a room and add to room connections (with new DB connection)
        async with async_session_maker() as db:
            membership_result = await db.execute(
                select(UserToRoom).where(UserToRoom.user_id == session.user_id)
            )
            membership = membership_result.scalar_one_or_none()
            if membership:
                room = await room_manager.get_room_by_id(db, str(membership.room_id))
                if room:
                    room_id = str(room.room_id)  # Cache room ID
                    is_host = str(room.host_session_id) == session_id
                    
                    # Check if this session has been announced before (using Redis)
                    is_reconnection = await connection_manager.redis.is_session_announced(room_id, session_id)
                    
                    # Add to room connections and get connection ID
                    connection_id = await connection_manager.add_to_room(session_id, room_id, websocket, session.nickname, is_host, is_reconnection)

                    # Handle room state based on phase
                    if room.phase == RoomPhase.WAITING:
                        # For waiting rooms, just send current state
                        await send_room_state(room, db)
                        # No checkpoint needed for waiting rooms
                    elif room.phase == RoomPhase.IN_GAME:
                        if not await game_orchestrator.is_game_active_async(room_id):
                            await websocket.close(code=4004, reason="Game not active")
                            return
                        await game_orchestrator.handle_player_reconnection(
                            room_id, session_id, websocket
                        )
            else:
                # Not in a room yet, just track the connection
                await websocket.close(code=4003, reason="Not in a room")
                return

        # Main message loop
        while True:
            try:
                # Receive message
                data = await websocket.receive_text()
                message = json.loads(data)

                logger.debug(
                    f"Received message from {session_id}: {message.get('type')}")

                # Handle ping/pong messages directly (don't route to game)
                msg_type = message.get("type")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                    if connection_id:
                        await connection_manager.handle_ping(connection_id)
                elif msg_type == "pong":
                    # Handle client pong response
                    await connection_manager.handle_pong(session_id)
                # Route other messages based on game state
                elif room_id and await game_orchestrator.is_game_active_async(room_id):
                    # Route game messages to orchestrator
                    await game_orchestrator.handle_player_message(
                        room_id, session_id, message
                    )
                else:
                    # Handle lobby/non-game messages (need DB for certain operations)
                    async with async_session_maker() as db:
                        await handle_lobby_message(websocket, session, message, db, connection_id)

            except WebSocketDisconnect:
                # Client disconnected, exit the loop
                break
            except json.JSONDecodeError:
                # Only try to send error if connection is still open
                try:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Invalid JSON"
                    })
                except:
                    # Connection likely closed, exit
                    break
            except Exception as e:
                logger.error(f"Error handling message from {session_id}: {e}")
                # Only try to send error if connection is still open
                try:
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e)
                    })
                except:
                    # Connection likely closed, exit
                    break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
    finally:
        # Clean up connection
        if session_id:
            await connection_manager.disconnect_session(session_id)


async def handle_lobby_message(websocket: WebSocket, session: UserSession, message: dict, db: AsyncSession, connection_id: str = None):
    """Handle messages when not in a game"""
    msg_type = message.get("type")

    # ping/pong are now handled at the main message loop level
    if msg_type == "get_session_info":
        # Check current room membership for session info
        membership_result = await db.execute(
            select(UserToRoom).where(UserToRoom.user_id == session.user_id)
        )
        current_membership = membership_result.scalar_one_or_none()
        await websocket.send_json({
            "type": "session_info",
            "session_id": str(session.user_id),
            "nickname": session.nickname,
            "room_id": str(current_membership.room_id) if current_membership else None
        })
    elif msg_type == "update_nickname":
        # Handle nickname update broadcast
        new_nickname = message.get("nickname")
        if new_nickname:
            # Update the session's nickname in memory (already updated in DB via API)
            session.nickname = new_nickname
            
            # Get the user's current room
            membership_result = await db.execute(
                select(UserToRoom).where(UserToRoom.user_id == session.user_id)
            )
            membership = membership_result.scalar_one_or_none()
            
            if membership:
                room = await room_manager.get_room_by_id(db, str(membership.room_id))
                if room and room.phase == RoomPhase.WAITING:
                    # Broadcast updated room state to all players
                    await send_room_state(room, db)
                elif room and room.phase == RoomPhase.IN_GAME:
                    # Broadcast nickname update message to all players in game
                    await connection_manager.broadcast_to_room(str(room.room_id), {
                        "type": "player_nickname_updated",
                        "player_id": str(session.user_id),
                        "nickname": new_nickname
                    })
    else:
        await websocket.send_json({
            "type": "error",
            "message": f"Unknown message type: {msg_type}"
        })


def set_connection_manager(conn_manager):
    """Set the connection manager instance (called from main app setup)"""
    global connection_manager
    connection_manager = conn_manager


def set_game_orchestrator(orchestrator):
    """Set the game orchestrator instance (called from main app setup)"""
    global game_orchestrator
    game_orchestrator = orchestrator
