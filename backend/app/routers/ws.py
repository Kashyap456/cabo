from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.room_manager import RoomManager
from services.game_manager import *
import json
import logging

logger = logging.getLogger(__name__)

ws_router = APIRouter()
room_manager = RoomManager()


@ws_router.websocket("/ws/{player_id}")
async def websocket_endpoint(websocket: WebSocket, player_id: str):
    await websocket.accept()
    
    # Connect the websocket to the existing player in their room
    if not room_manager.connect_websocket(player_id, websocket):
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Player not found in any room. Please join a room via HTTP first."
        }))
        await websocket.close()
        return
    
    # Send initial room state
    room_id = room_manager.get_player_room(player_id)
    if room_id:
        await send_room_state(room_id, player_id)
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                await handle_websocket_message(websocket, player_id, message)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON format"
                }))
            except Exception as e:
                logger.error(f"Error handling message: {e}")
                await websocket.send_text(json.dumps({
                    "type": "error", 
                    "message": str(e)
                }))
    
    except WebSocketDisconnect:
        # Mark player as disconnected but don't remove from room
        room_id = room_manager.get_player_room(player_id)
        if room_id:
            room = room_manager.get_room(room_id)
            if room and player_id in room.players:
                room.players[player_id].is_connected = False
                room.players[player_id].websocket = None


async def handle_websocket_message(websocket: WebSocket, player_id: str, message: dict):
    message_type = message.get("type")
    data = message.get("data", {})
    
    if message_type == "game_action":
        await handle_game_action(player_id, data)
    
    elif message_type == "get_room_state":
        room_id = room_manager.get_player_room(player_id)
        if room_id:
            await send_room_state(room_id, player_id)
    
    elif message_type == "ping":
        await websocket.send_text(json.dumps({
            "type": "pong",
            "timestamp": data.get("timestamp")
        }))
    
    else:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Unknown message type: {message_type}. Use HTTP API for room management."
        }))


async def handle_game_action(player_id: str, action_data: dict):
    action_type = action_data.get("action")
    
    try:
        if action_type == "draw_card":
            message = DrawCardMessage(player_id=player_id)
        elif action_type == "play_drawn_card":
            message = PlayDrawnCardMessage(player_id=player_id)
        elif action_type == "replace_and_play":
            message = ReplaceAndPlayMessage(
                player_id=player_id,
                hand_index=action_data.get("hand_index", 0)
            )
        elif action_type == "call_stack":
            message = CallStackMessage(player_id=player_id)
        elif action_type == "execute_stack":
            message = ExecuteStackMessage(
                player_id=player_id,
                card_index=action_data.get("card_index", 0),
                target_player_id=action_data.get("target_player_id")
            )
        elif action_type == "call_cabo":
            message = CallCaboMessage(player_id=player_id)
        elif action_type == "view_own_card":
            message = ViewOwnCardMessage(
                player_id=player_id,
                card_index=action_data.get("card_index", 0)
            )
        elif action_type == "view_opponent_card":
            message = ViewOpponentCardMessage(
                player_id=player_id,
                target_player_id=action_data.get("target_player_id", ""),
                card_index=action_data.get("card_index", 0)
            )
        elif action_type == "swap_cards":
            message = SwapCardsMessage(
                player_id=player_id,
                own_index=action_data.get("own_index", 0),
                target_player_id=action_data.get("target_player_id", ""),
                target_index=action_data.get("target_index", 0)
            )
        elif action_type == "king_view_card":
            message = KingViewCardMessage(
                player_id=player_id,
                target_player_id=action_data.get("target_player_id", ""),
                card_index=action_data.get("card_index", 0)
            )
        elif action_type == "king_swap_cards":
            message = KingSwapCardsMessage(
                player_id=player_id,
                own_index=action_data.get("own_index", 0),
                target_player_id=action_data.get("target_player_id", ""),
                target_index=action_data.get("target_index", 0)
            )
        elif action_type == "king_skip_swap":
            message = KingSkipSwapMessage(player_id=player_id)
        else:
            await room_manager.send_to_player(player_id, "error", {
                "message": f"Unknown action: {action_type}"
            })
            return
        
        success = await room_manager.handle_game_message(player_id, message)
        if not success:
            await room_manager.send_to_player(player_id, "error", {
                "message": "Failed to process game action"
            })
    
    except Exception as e:
        logger.error(f"Error processing game action: {e}")
        await room_manager.send_to_player(player_id, "error", {
            "message": str(e)
        })


async def send_room_state(room_id: str, player_id: str):
    state = room_manager.get_room_state(room_id, player_id)
    if state:
        await room_manager.send_to_player(player_id, "room_state", state)


async def broadcast_room_state(room_id: str):
    room = room_manager.get_room(room_id)
    if not room:
        return
    
    for player_id in room.players.keys():
        if room.players[player_id].is_connected:
            await send_room_state(room_id, player_id)
