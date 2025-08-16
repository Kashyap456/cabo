import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock
from services.room_manager import RoomManager, RoomPhase
from services.game_manager import DrawCardMessage, PlayDrawnCardMessage, CallCaboMessage, GamePhase


class MockWebSocket:
    def __init__(self):
        self.sent_messages = []
    
    async def send_text(self, message):
        self.sent_messages.append(message)


@pytest.fixture
def room_manager():
    return RoomManager()


@pytest.fixture
def mock_websocket():
    return MockWebSocket()


@pytest.mark.asyncio
async def test_create_room_http(room_manager):
    """Test creating a new room via HTTP"""
    room_id = room_manager.create_room_http("player1", "Alice", max_players=4)
    
    assert room_id is not None
    assert len(room_id) == 8  # UUID shortened to 8 chars
    assert room_id in room_manager.rooms
    
    room = room_manager.get_room(room_id)
    assert room.host_id == "player1"
    assert room.phase == RoomPhase.WAITING
    assert len(room.players) == 1
    assert "player1" in room.players
    assert not room.players["player1"].is_connected  # Not connected via WS yet
    assert room.players["player1"].websocket is None


@pytest.mark.asyncio
async def test_join_room_http(room_manager):
    """Test joining an existing room via HTTP"""
    room_id = room_manager.create_room_http("player1", "Alice")
    
    success = room_manager.join_room_http(room_id, "player2", "Bob")
    
    assert success is True
    
    room = room_manager.get_room(room_id)
    assert len(room.players) == 2
    assert "player2" in room.players
    assert room.players["player2"].player_name == "Bob"
    assert not room.players["player2"].is_connected  # Not connected via WS yet


@pytest.mark.asyncio
async def test_cannot_join_nonexistent_room(room_manager):
    """Test that joining a nonexistent room raises ValueError"""
    with pytest.raises(ValueError, match="Room not found"):
        room_manager.join_room_http("nonexistent", "player1", "Alice")


@pytest.mark.asyncio
async def test_cannot_join_room_twice(room_manager):
    """Test that a player cannot be in multiple rooms"""
    room_id1 = room_manager.create_room_http("player1", "Alice")
    room_id2 = room_manager.create_room_http("player2", "Bob")
    
    # Player 1 tries to join room 2 while already hosting room 1
    with pytest.raises(ValueError, match="Player already in a room"):
        room_manager.join_room_http(room_id2, "player1", "Alice")


@pytest.mark.asyncio
async def test_connect_websocket(room_manager, mock_websocket):
    """Test connecting a websocket to an existing player"""
    room_id = room_manager.create_room_http("player1", "Alice")
    
    # Initially not connected
    room = room_manager.get_room(room_id)
    assert not room.players["player1"].is_connected
    
    # Connect websocket
    success = room_manager.connect_websocket("player1", mock_websocket)
    assert success is True
    
    # Now connected
    assert room.players["player1"].is_connected
    assert room.players["player1"].websocket == mock_websocket


@pytest.mark.asyncio
async def test_connect_websocket_player_not_in_room(room_manager, mock_websocket):
    """Test connecting websocket for player not in any room"""
    success = room_manager.connect_websocket("nonexistent_player", mock_websocket)
    assert success is False


@pytest.mark.asyncio
async def test_leave_room_http(room_manager):
    """Test leaving a room via HTTP"""
    room_id = room_manager.create_room_http("player1", "Alice")
    room_manager.join_room_http(room_id, "player2", "Bob")
    
    # Player 2 leaves
    success = room_manager.leave_room_http(room_id, "player2")
    assert success is True
    
    room = room_manager.get_room(room_id)
    assert len(room.players) == 1
    assert "player2" not in room.players
    assert "player2" not in room_manager.player_to_room


@pytest.mark.asyncio
async def test_leave_room_deletes_empty_room(room_manager):
    """Test that leaving a room deletes it if empty"""
    room_id = room_manager.create_room_http("player1", "Alice")
    
    # Host leaves, room should be deleted
    success = room_manager.leave_room_http(room_id, "player1")
    assert success is True
    
    assert room_id not in room_manager.rooms
    assert "player1" not in room_manager.player_to_room


@pytest.mark.asyncio
async def test_get_room_info(room_manager):
    """Test getting room information"""
    room_id = room_manager.create_room_http("player1", "Alice", max_players=3)
    room_manager.join_room_http(room_id, "player2", "Bob")
    
    room_info = room_manager.get_room_info(room_id)
    
    assert room_info is not None
    assert room_info["room_id"] == room_id
    assert room_info["phase"] == "waiting"
    assert room_info["max_players"] == 3
    assert room_info["host_id"] == "player1"
    assert len(room_info["players"]) == 2
    
    # Check player info
    player_names = [p["name"] for p in room_info["players"]]
    assert "Alice" in player_names
    assert "Bob" in player_names


@pytest.mark.asyncio
async def test_start_game_http_flow(room_manager, mock_websocket):
    """Test starting a game after HTTP room creation"""
    room_id = room_manager.create_room_http("player1", "Alice")
    room_manager.join_room_http(room_id, "player2", "Bob")
    
    # Connect websockets (required for game events)
    room_manager.connect_websocket("player1", mock_websocket)
    room_manager.connect_websocket("player2", MockWebSocket())
    
    success = room_manager.start_game(room_id, "player1")
    assert success is True
    
    room = room_manager.get_room(room_id)
    assert room.phase == RoomPhase.PLAYING
    assert room.game is not None


@pytest.mark.asyncio
async def test_room_full_check(room_manager):
    """Test that rooms enforce max player limit via HTTP"""
    room_id = room_manager.create_room_http("player1", "Alice", max_players=2)
    
    # Add one more player (total 2, which is max)
    success = room_manager.join_room_http(room_id, "player2", "Bob")
    assert success is True
    
    # Try to add 3rd player - should fail
    success = room_manager.join_room_http(room_id, "player3", "Charlie")
    assert success is False


@pytest.mark.asyncio
async def test_cannot_join_room_in_progress(room_manager, mock_websocket):
    """Test that players cannot join a room where game is in progress"""
    room_id = room_manager.create_room_http("player1", "Alice")
    room_manager.join_room_http(room_id, "player2", "Bob")
    
    # Connect websockets and start game
    room_manager.connect_websocket("player1", mock_websocket)
    room_manager.connect_websocket("player2", MockWebSocket())
    room_manager.start_game(room_id, "player1")
    
    # Try to join after game started
    success = room_manager.join_room_http(room_id, "player3", "Charlie")
    assert success is False


@pytest.mark.asyncio
async def test_mixed_http_ws_workflow(room_manager, mock_websocket):
    """Test the complete workflow: HTTP room creation -> WS connection -> game play"""
    # 1. Create room via HTTP
    room_id = room_manager.create_room_http("player1", "Alice")
    room_manager.join_room_http(room_id, "player2", "Bob")
    
    # 2. Connect via WebSocket
    room_manager.connect_websocket("player1", mock_websocket)
    room_manager.connect_websocket("player2", MockWebSocket())
    
    # 3. Start game via HTTP
    room_manager.start_game(room_id, "player1")
    
    # 4. Play game via WebSocket (game message handling)
    room = room_manager.get_room(room_id)
    room.game.state.phase = GamePhase.PLAYING
    
    message = DrawCardMessage(player_id="player1")
    success = await room_manager.handle_game_message("player1", message)
    assert success is True