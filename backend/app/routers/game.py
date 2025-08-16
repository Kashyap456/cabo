from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from services.room_manager import RoomManager

game_router = APIRouter()
room_manager = RoomManager()


class CreateRoomRequest(BaseModel):
    host_id: str
    host_name: str
    max_players: int = 4


class JoinRoomRequest(BaseModel):
    player_id: str
    player_name: str


class StartGameRequest(BaseModel):
    player_id: str


@game_router.post("/rooms")
async def create_room(request: CreateRoomRequest):
    """Create a new game room"""
    try:
        room_id = room_manager.create_room_http(
            host_id=request.host_id,
            host_name=request.host_name,
            max_players=request.max_players
        )
        return {
            "room_id": room_id,
            "host_id": request.host_id,
            "max_players": request.max_players
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@game_router.post("/rooms/{room_id}/join")
async def join_room(room_id: str, request: JoinRoomRequest):
    """Join an existing room"""
    try:
        success = room_manager.join_room_http(
            room_id=room_id,
            player_id=request.player_id,
            player_name=request.player_name
        )
        if not success:
            raise HTTPException(status_code=400, detail="Failed to join room")
        
        room_info = room_manager.get_room_info(room_id)
        return {
            "room_id": room_id,
            "player_id": request.player_id,
            "room_info": room_info
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@game_router.post("/rooms/{room_id}/start")
async def start_game(room_id: str, request: StartGameRequest):
    """Start the game in a room (host only)"""
    try:
        success = room_manager.start_game(room_id, request.player_id)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to start game")
        
        return {
            "room_id": room_id,
            "status": "game_started",
            "message": "Game has been started. Connect via WebSocket for real-time updates."
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@game_router.post("/rooms/{room_id}/leave")
async def leave_room(room_id: str, player_id: str):
    """Leave a room"""
    try:
        success = room_manager.leave_room_http(room_id, player_id)
        if not success:
            raise HTTPException(status_code=404, detail="Player not found in room")
        
        return {"status": "left_room", "room_id": room_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@game_router.get("/rooms")
async def list_rooms():
    """List all available rooms"""
    rooms = []
    for room_id, room in room_manager.rooms.items():
        rooms.append({
            "room_id": room_id,
            "phase": room.phase.value,
            "player_count": room.player_count,
            "max_players": room.max_players,
            "is_full": room.is_full,
            "host_name": next((p.player_name for p in room.players.values() if p.player_id == room.host_id), "Unknown")
        })
    return {"rooms": rooms}


@game_router.get("/rooms/{room_id}")
async def get_room_info(room_id: str):
    """Get information about a specific room"""
    room_info = room_manager.get_room_info(room_id)
    if not room_info:
        raise HTTPException(status_code=404, detail="Room not found")
    
    return room_info


@game_router.get("/rooms/{room_id}/state")
async def get_game_state(room_id: str, player_id: str):
    """Get current game state for a player"""
    state = room_manager.get_room_state(room_id, player_id)
    if not state:
        raise HTTPException(status_code=404, detail="Room not found")
    
    return state


@game_router.get("/players/{player_id}/room")
async def get_player_room(player_id: str):
    """Get the room a player is currently in"""
    room_id = room_manager.get_player_room(player_id)
    if not room_id:
        raise HTTPException(status_code=404, detail="Player not in any room")
    
    return {"room_id": room_id}


@game_router.get("/health")
async def health_check():
    """Health check for game service"""
    return {
        "status": "healthy",
        "active_rooms": len(room_manager.rooms),
        "total_players": sum(room.player_count for room in room_manager.rooms.values())
    }