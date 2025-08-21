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


async def create_room_waiting_checkpoint(room: GameRoom, db: AsyncSession):
    """Create a waiting state checkpoint for the room"""
    # Get all players in room
    players = await room_manager.get_room_players(db, room.room_id)

    checkpoint_data = {
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

    await connection_manager.create_room_checkpoint(str(room.room_id), "WAITING", checkpoint_data)


def serialize_card_for_player(card, viewer_id: str, owner_id: str, card_index: int, temporarily_viewed_cards) -> dict:
    """Serialize a card based on what the viewer is allowed to see"""
    # Check if this card is temporarily viewed by the viewer (includes special actions)
    if (owner_id, card_index) in temporarily_viewed_cards.get(viewer_id, set()):
        return {
            "id": f"{owner_id}_{card_index}",
            "rank": card.rank.value if hasattr(card.rank, 'value') else card.rank,
            "suit": card.suit.value if card.suit and hasattr(card.suit, 'value') else card.suit,
            "isTemporarilyViewed": True
        }

    # Everyone can see cards in discard pile or played cards
    if owner_id in ["discard", "played"]:
        return {
            "id": f"{owner_id}_{card_index}" if owner_id == "discard" else "played_card",
            "rank": card.rank.value if hasattr(card.rank, 'value') else card.rank,
            "suit": card.suit.value if card.suit and hasattr(card.suit, 'value') else card.suit,
            "isTemporarilyViewed": False
        }
    
    # Drawn card is visible to the player who drew it
    if owner_id == "drawn":
        return {
            "id": f"drawn_{viewer_id}",
            "rank": card.rank.value if hasattr(card.rank, 'value') else card.rank,
            "suit": card.suit.value if card.suit and hasattr(card.suit, 'value') else card.suit,
            "isTemporarilyViewed": True  # Drawn card should always be visible
        }

    # Other cards are hidden
    return {
        "id": f"{owner_id}_{card_index}",
        "rank": "?",
        "suit": "?",
        "isTemporarilyViewed": False
    }


async def create_room_playing_checkpoint_for_player(room: GameRoom, game_state, players, viewer_id: str, db: AsyncSession):
    """Create a personalized playing state checkpoint for a specific player"""
    # Game players should be in same order as database players since they were created from them
    current_player_id = None
    if 0 <= game_state.current_player_index < len(players):
        current_player_id = str(
            players[game_state.current_player_index].user_id)

    checkpoint_data = {
        "room": {
            "room_id": str(room.room_id),
            "room_code": room.room_code,
        },
        "game": {
            "current_player_id": current_player_id,
            "phase": game_state.phase.value,
            "turn_number": getattr(game_state, 'turn_number', 1),
            "players": [
                {
                    "id": str(db_player.user_id),
                    "nickname": db_player.nickname,
                    "cards": [
                        serialize_card_for_player(
                            game_player.hand[card_index],
                            viewer_id,
                            str(db_player.user_id),
                            card_index,
                            game_state.temporarily_viewed_cards
                        )
                        for card_index in range(len(game_player.hand))
                    ],
                    "has_called_cabo": game_player.has_called_cabo
                }
                for db_player, game_player in zip(players, game_state.players)
            ],
            "top_discard_card": serialize_card_for_player(
                game_state.discard_pile[-1], viewer_id, "discard", 0, {}
            ) if game_state.discard_pile else None,
            "played_card": serialize_card_for_player(
                game_state.played_card, viewer_id, "played", 0, {}
            ) if game_state.played_card else None,
            "special_action": {
                "type": game_state.special_action_type,
                "player_id": game_state.special_action_player
            } if game_state.special_action_player else None,
            "stack_caller": game_state.stack_caller,
            "cabo_called_by": game_state.cabo_caller,
            "final_round_started": game_state.final_round_started
        }
    }

    return checkpoint_data


async def broadcast_room_playing_checkpoint(room: GameRoom, game_state, players, db: AsyncSession):
    """Create and broadcast personalized sequenced checkpoints to all players in the room"""
    # Get all connected players
    room_sessions = connection_manager.get_room_sessions(str(room.room_id))

    for session_id in room_sessions:
        # Create personalized checkpoint for this player
        checkpoint_data = await create_room_playing_checkpoint_for_player(room, game_state, players, session_id, db)

        # Create sequenced checkpoint and send to this specific player
        checkpoint = connection_manager.sequencer.create_checkpoint(
            str(room.room_id), "IN_GAME", checkpoint_data)
        await connection_manager.send_to_session(session_id, checkpoint.to_dict())


@ws_router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    session_token: str = Cookie(...),
):
    """WebSocket endpoint for real-time game communication"""
    from app.core.database import async_session_maker
    
    logger.info(f"New WebSocket connection from {websocket.client.host}:{websocket.client.port}")
    
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
        logger.info(f"WebSocket connection accepted for session {session_id} from {websocket.client}")

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
                    # Always treat as new connection here (reconnection is handled internally)
                    is_reconnection = False
                    # Add to room connections and get connection ID
                    connection_id = await connection_manager.add_to_room(session_id, room_id, websocket, session.nickname, is_host, is_reconnection)

                    # Create/update room checkpoint for waiting state
                    if room.phase == RoomPhase.WAITING:
                        await create_room_waiting_checkpoint(room, db)
                    elif room.phase == RoomPhase.IN_GAME:
                        await game_orchestrator._create_player_checkpoint(room_id, session_id)

                    # Synchronize client with current state
                    await connection_manager.synchronize_client(room_id, session_id)
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
    elif msg_type == "ack_seq":
        # Handle sequence acknowledgment
        seq_num = message.get("seq_num")
        if seq_num is not None:
            # Get user's room
            membership_result = await db.execute(
                select(UserToRoom).where(UserToRoom.user_id == session.user_id)
            )
            current_membership = membership_result.scalar_one_or_none()
            if current_membership:
                await connection_manager.acknowledge_sequence(
                    str(current_membership.room_id),
                    str(session.user_id),
                    seq_num
                )
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
