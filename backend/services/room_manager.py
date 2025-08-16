from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field
import uuid
import asyncio
from enum import Enum
from services.game_manager import CaboGame, GameEvent, GameMessage
import json


class RoomPhase(Enum):
    WAITING = "waiting"
    PLAYING = "playing"
    FINISHED = "finished"


@dataclass
class PlayerConnection:
    player_id: str
    player_name: str
    websocket: Optional[object] = None
    is_connected: bool = True


@dataclass
class Room:
    room_id: str
    host_id: str
    players: Dict[str, PlayerConnection] = field(default_factory=dict)
    max_players: int = 4
    phase: RoomPhase = RoomPhase.WAITING
    game: Optional[CaboGame] = None
    
    @property
    def is_full(self) -> bool:
        return len(self.players) >= self.max_players
    
    @property
    def player_count(self) -> int:
        return len([p for p in self.players.values() if p.is_connected])


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.player_to_room: Dict[str, str] = {}
    
    def create_room_http(self, host_id: str, host_name: str, max_players: int = 4) -> str:
        """Create a room via HTTP (no websocket connection yet)"""
        if host_id in self.player_to_room:
            raise ValueError("Player already in a room")
        
        room_id = str(uuid.uuid4())[:8]
        
        player_connection = PlayerConnection(
            player_id=host_id,
            player_name=host_name,
            websocket=None,
            is_connected=False  # Not connected via WS yet
        )
        
        room = Room(
            room_id=room_id,
            host_id=host_id,
            players={host_id: player_connection},
            max_players=max_players
        )
        
        self.rooms[room_id] = room
        self.player_to_room[host_id] = room_id
        
        return room_id
    
    def create_room(self, host_id: str, host_name: str, websocket) -> str:
        room_id = str(uuid.uuid4())[:8]
        
        player_connection = PlayerConnection(
            player_id=host_id,
            websocket=websocket,
            player_name=host_name
        )
        
        room = Room(
            room_id=room_id,
            host_id=host_id,
            players={host_id: player_connection}
        )
        
        self.rooms[room_id] = room
        self.player_to_room[host_id] = room_id
        
        return room_id
    
    def join_room_http(self, room_id: str, player_id: str, player_name: str) -> bool:
        """Join a room via HTTP (no websocket connection yet)"""
        if player_id in self.player_to_room:
            raise ValueError("Player already in a room")
        
        if room_id not in self.rooms:
            raise ValueError("Room not found")
        
        room = self.rooms[room_id]
        
        if room.is_full or room.phase != RoomPhase.WAITING:
            return False
        
        player_connection = PlayerConnection(
            player_id=player_id,
            player_name=player_name,
            websocket=None,
            is_connected=False  # Not connected via WS yet
        )
        
        room.players[player_id] = player_connection
        self.player_to_room[player_id] = room_id
        
        return True
    
    def join_room(self, room_id: str, player_id: str, player_name: str, websocket) -> bool:
        if room_id not in self.rooms:
            return False
        
        room = self.rooms[room_id]
        
        if room.is_full or room.phase != RoomPhase.WAITING:
            return False
        
        player_connection = PlayerConnection(
            player_id=player_id,
            websocket=websocket,
            player_name=player_name
        )
        
        room.players[player_id] = player_connection
        self.player_to_room[player_id] = room_id
        
        return True
    
    def leave_room(self, player_id: str) -> Optional[str]:
        if player_id not in self.player_to_room:
            return None
        
        room_id = self.player_to_room[player_id]
        room = self.rooms[room_id]
        
        if player_id in room.players:
            room.players[player_id].is_connected = False
            
            if room.phase == RoomPhase.WAITING:
                del room.players[player_id]
                del self.player_to_room[player_id]
        
        if len([p for p in room.players.values() if p.is_connected]) == 0:
            del self.rooms[room_id]
            for pid in list(room.players.keys()):
                self.player_to_room.pop(pid, None)
        
        return room_id
    
    def leave_room_http(self, room_id: str, player_id: str) -> bool:
        """Leave a room via HTTP"""
        if player_id not in self.player_to_room:
            return False
        
        if self.player_to_room[player_id] != room_id:
            return False
        
        room = self.rooms[room_id]
        
        if player_id in room.players:
            del room.players[player_id]
            del self.player_to_room[player_id]
        
        # If room is empty, delete it
        if len(room.players) == 0:
            del self.rooms[room_id]
        
        return True
    
    def get_room_info(self, room_id: str) -> Optional[dict]:
        """Get detailed room information"""
        room = self.get_room(room_id)
        if not room:
            return None
        
        return {
            "room_id": room_id,
            "phase": room.phase.value,
            "players": [
                {
                    "player_id": p.player_id,
                    "name": p.player_name,
                    "is_connected": p.is_connected,
                    "is_host": p.player_id == room.host_id
                }
                for p in room.players.values()
            ],
            "max_players": room.max_players,
            "is_full": room.is_full,
            "host_id": room.host_id
        }
    
    def connect_websocket(self, player_id: str, websocket) -> bool:
        """Connect a websocket to an existing player in a room"""
        room_id = self.get_player_room(player_id)
        if not room_id:
            return False
        
        room = self.get_room(room_id)
        if not room or player_id not in room.players:
            return False
        
        player_conn = room.players[player_id]
        player_conn.websocket = websocket
        player_conn.is_connected = True
        
        return True
    
    def start_game(self, room_id: str, player_id: str) -> bool:
        if room_id not in self.rooms:
            return False
        
        room = self.rooms[room_id]
        
        if room.host_id != player_id or room.phase != RoomPhase.WAITING:
            return False
        
        if room.player_count < 2:
            return False
        
        connected_players = [p for p in room.players.values() if p.is_connected]
        player_ids = [p.player_id for p in connected_players]
        player_names = [p.player_name for p in connected_players]
        
        room.game = CaboGame(
            player_ids=player_ids,
            player_names=player_names,
            broadcast_callback=lambda event: asyncio.create_task(
                self._broadcast_to_room(room_id, event)
            )
        )
        
        room.phase = RoomPhase.PLAYING
        return True
    
    def get_room(self, room_id: str) -> Optional[Room]:
        return self.rooms.get(room_id)
    
    def get_player_room(self, player_id: str) -> Optional[str]:
        return self.player_to_room.get(player_id)
    
    async def handle_game_message(self, player_id: str, message: GameMessage) -> bool:
        room_id = self.get_player_room(player_id)
        if not room_id:
            return False
        
        room = self.get_room(room_id)
        if not room or not room.game:
            return False
        
        room.game.add_message(message)
        events = room.game.process_messages()
        
        return True
    
    async def _broadcast_to_room(self, room_id: str, event: GameEvent):
        if room_id not in self.rooms:
            return
        
        room = self.rooms[room_id]
        message = json.dumps({
            "type": "game_event",
            "event_type": event.event_type,
            "data": event.data,
            "timestamp": event.timestamp
        })
        
        disconnected_players = []
        
        for player_id, player_conn in room.players.items():
            if player_conn.is_connected:
                try:
                    await player_conn.websocket.send_text(message)
                except Exception:
                    player_conn.is_connected = False
                    disconnected_players.append(player_id)
        
        for player_id in disconnected_players:
            self.leave_room(player_id)
    
    async def send_to_player(self, player_id: str, message_type: str, data: dict):
        room_id = self.get_player_room(player_id)
        if not room_id:
            return False
        
        room = self.get_room(room_id)
        if not room or player_id not in room.players:
            return False
        
        player_conn = room.players[player_id]
        if not player_conn.is_connected:
            return False
        
        message = json.dumps({
            "type": message_type,
            "data": data
        })
        
        try:
            await player_conn.websocket.send_text(message)
            return True
        except Exception:
            player_conn.is_connected = False
            self.leave_room(player_id)
            return False
    
    def get_room_state(self, room_id: str, requesting_player_id: str) -> Optional[dict]:
        room = self.get_room(room_id)
        if not room:
            return None
        
        base_state = {
            "room_id": room_id,
            "phase": room.phase.value,
            "players": [
                {
                    "player_id": p.player_id,
                    "name": p.player_name,
                    "is_connected": p.is_connected,
                    "is_host": p.player_id == room.host_id
                }
                for p in room.players.values()
            ],
            "max_players": room.max_players
        }
        
        if room.game and room.phase == RoomPhase.PLAYING:
            game_state = room.game.get_game_state(requesting_player_id)
            base_state["game"] = game_state
        
        return base_state