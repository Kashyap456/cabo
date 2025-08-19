from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, Cookie
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging
import json
from typing import Optional

from app.core.database import get_db
from app.models import UserSession, GameRoom, UserToRoom
from services.connection_manager import ConnectionManager
from services.room_manager import RoomManager

logger = logging.getLogger(__name__)
ws_router = APIRouter()

# Global connection manager instance
connection_manager = ConnectionManager()
room_manager = RoomManager()

# This will be initialized later with GameOrchestrator
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


@ws_router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    session_token: str = Cookie(...),
    db: AsyncSession = Depends(get_db)
):
    """WebSocket endpoint for real-time game communication"""
    session = None
    session_id = None

    try:
        # Authenticate
        print(session_token)
        session = await authenticate_websocket(websocket, session_token, db)
        if not session:
            await websocket.close(code=4001, reason="Unauthorized")
            return

        session_id = str(session.user_id)

        # Accept connection
        await websocket.accept()
        logger.info(f"WebSocket connection accepted for session {session_id}")

        # Check if session is in a room and add to room connections
        membership_result = await db.execute(
            select(UserToRoom).where(UserToRoom.user_id == session.user_id)
        )
        membership = membership_result.scalar_one_or_none()
        if membership:
            room = await room_manager.get_room_by_id(db, str(membership.room_id))
            if room:
                is_host = str(room.host_session_id) == session_id
                await connection_manager.add_to_room(session_id, str(room.room_id), websocket, session.nickname, is_host)
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

                # Route message based on type
                # Check if session is in a room for game messages
                membership_result = await db.execute(
                    select(UserToRoom).where(
                        UserToRoom.user_id == session.user_id)
                )
                membership = membership_result.scalar_one_or_none()
                if membership and game_orchestrator:
                    # Route game messages to orchestrator
                    # TODO: Uncomment when GameOrchestrator is implemented
                    # await game_orchestrator.handle_player_message(
                    #     str(session.room_id), session_id, message
                    # )

                    # For now, just echo to room for testing
                    await connection_manager.broadcast_to_room(
                        str(membership.room_id),
                        {
                            "type": "game_message",
                            "from": session_id,
                            "data": message
                        }
                    )
                else:
                    # Handle lobby/non-game messages
                    await handle_lobby_message(websocket, session, message, db)

            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid JSON"
                })
            except Exception as e:
                logger.error(f"Error handling message from {session_id}: {e}")
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
    finally:
        # Clean up connection
        if session_id:
            await connection_manager.disconnect_session(session_id)


async def handle_lobby_message(websocket: WebSocket, session: UserSession, message: dict, db: AsyncSession):
    """Handle messages when not in a game"""
    msg_type = message.get("type")

    if msg_type == "ping":
        await websocket.send_json({"type": "pong"})
    elif msg_type == "get_session_info":
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
    else:
        await websocket.send_json({
            "type": "error",
            "message": f"Unknown message type: {msg_type}"
        })


def set_game_orchestrator(orchestrator):
    """Set the game orchestrator instance (called from main app setup)"""
    global game_orchestrator
    game_orchestrator = orchestrator
