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
async def test_create_room(room_manager, mock_websocket):
    """Test creating a new room"""
    room_id = room_manager.create_room("player1", "Alice", mock_websocket)
    
    assert room_id is not None
    assert len(room_id) == 8  # UUID shortened to 8 chars
    assert room_id in room_manager.rooms
    
    room = room_manager.get_room(room_id)
    assert room.host_id == "player1"
    assert room.phase == RoomPhase.WAITING
    assert len(room.players) == 1
    assert "player1" in room.players


@pytest.mark.asyncio
async def test_join_room(room_manager, mock_websocket):
    """Test joining an existing room"""
    room_id = room_manager.create_room("player1", "Alice", mock_websocket)
    
    mock_websocket2 = MockWebSocket()
    success = room_manager.join_room(room_id, "player2", "Bob", mock_websocket2)
    
    assert success is True
    
    room = room_manager.get_room(room_id)
    assert len(room.players) == 2
    assert "player2" in room.players
    assert room.players["player2"].player_name == "Bob"


@pytest.mark.asyncio
async def test_start_game(room_manager, mock_websocket):
    """Test starting a game"""
    room_id = room_manager.create_room("player1", "Alice", mock_websocket)
    room_manager.join_room(room_id, "player2", "Bob", MockWebSocket())
    
    success = room_manager.start_game(room_id, "player1")
    
    assert success is True
    
    room = room_manager.get_room(room_id)
    assert room.phase == RoomPhase.PLAYING
    assert room.game is not None


@pytest.mark.asyncio
async def test_handle_game_message(room_manager, mock_websocket):
    """Test handling game messages"""
    room_id = room_manager.create_room("player1", "Alice", mock_websocket)
    room_manager.join_room(room_id, "player2", "Bob", MockWebSocket())
    room_manager.start_game(room_id, "player1")
    
    # Wait for setup timeout to expire and game to start
    room = room_manager.get_room(room_id)
    room.game.state.phase = GamePhase.PLAYING
    
    message = DrawCardMessage(player_id="player1")
    success = await room_manager.handle_game_message("player1", message)
    
    assert success is True


@pytest.mark.asyncio
async def test_leave_room(room_manager, mock_websocket):
    """Test leaving a room"""
    room_id = room_manager.create_room("player1", "Alice", mock_websocket)
    room_manager.join_room(room_id, "player2", "Bob", MockWebSocket())
    
    # Player 2 leaves
    returned_room_id = room_manager.leave_room("player2")
    
    assert returned_room_id == room_id
    
    room = room_manager.get_room(room_id)
    assert len(room.players) == 1
    assert "player2" not in room.players


@pytest.mark.asyncio
async def test_get_room_state(room_manager, mock_websocket):
    """Test getting room state"""
    room_id = room_manager.create_room("player1", "Alice", mock_websocket)
    room_manager.join_room(room_id, "player2", "Bob", MockWebSocket())
    
    state = room_manager.get_room_state(room_id, "player1")
    
    assert state is not None
    assert state["room_id"] == room_id
    assert state["phase"] == "waiting"
    assert len(state["players"]) == 2


@pytest.mark.asyncio
async def test_room_full(room_manager, mock_websocket):
    """Test that rooms enforce max player limit"""
    room_id = room_manager.create_room("player1", "Alice", mock_websocket)
    
    # Add 3 more players (total 4, which is max)
    for i in range(2, 5):
        success = room_manager.join_room(room_id, f"player{i}", f"Player{i}", MockWebSocket())
        assert success is True
    
    # Try to add 5th player - should fail
    success = room_manager.join_room(room_id, "player5", "Player5", MockWebSocket())
    assert success is False


@pytest.mark.asyncio
async def test_cannot_start_game_with_one_player(room_manager, mock_websocket):
    """Test that game cannot start with only one player"""
    room_id = room_manager.create_room("player1", "Alice", mock_websocket)
    
    success = room_manager.start_game(room_id, "player1")
    
    assert success is False


@pytest.mark.asyncio
async def test_only_host_can_start_game(room_manager, mock_websocket):
    """Test that only the host can start the game"""
    room_id = room_manager.create_room("player1", "Alice", mock_websocket)
    room_manager.join_room(room_id, "player2", "Bob", MockWebSocket())
    
    # Non-host tries to start game
    success = room_manager.start_game(room_id, "player2")
    assert success is False
    
    # Host starts game
    success = room_manager.start_game(room_id, "player1")
    assert success is True