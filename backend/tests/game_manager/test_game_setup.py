"""Tests for game setup and initialization"""

import pytest
from services.game_manager import CaboGame, GamePhase, Rank
from .utils import (
    create_test_game, MockBroadcaster, assert_player_hand_size,
    assert_card_is_known, assert_game_phase, assert_current_player,
    assert_event_generated
)


class TestGameInitialization:
    """Test game initialization and setup"""
    
    def test_game_creates_with_correct_players(self):
        """Test game initializes with the correct number of players"""
        player_names = ["Alice", "Bob", "Charlie"]
        game = create_test_game(player_names)
        
        assert len(game.players) == 3
        assert game.players[0].name == "Alice"
        assert game.players[1].name == "Charlie"
        assert game.players[2].name == "Bob"
        
        # Check player IDs are set
        assert game.players[0].player_id == "player_0"
        assert game.players[1].player_id == "player_1"
        assert game.players[2].player_id == "player_2"
    
    def test_game_generates_unique_id(self):
        """Test each game gets a unique ID"""
        game1 = create_test_game()
        game2 = create_test_game()
        
        assert game1.game_id != game2.game_id
        assert len(game1.game_id) > 0
    
    def test_initial_phase_is_playing(self):
        """Test game starts in playing phase"""
        game = create_test_game()
        assert_game_phase(game, GamePhase.PLAYING)
    
    def test_random_starting_player_selected(self):
        """Test a starting player is selected"""
        game = create_test_game()
        assert 0 <= game.state.current_player_index < len(game.players)
    
    def test_deck_created_with_correct_size(self):
        """Test deck is created with correct number of cards after dealing"""
        game = create_test_game(["Alice", "Bob", "Charlie"])
        
        # Standard deck (52) + 2 jokers = 54 cards
        # Minus 12 cards dealt (4 per player * 3 players) = 42 cards remaining
        expected_remaining = 54 - (4 * 3)
        assert game.deck.size() == expected_remaining
    
    def test_broadcast_callback_setup(self):
        """Test broadcast callback is properly set"""
        broadcaster = MockBroadcaster()
        game = create_test_game(broadcast_callback=broadcaster)
        
        assert game.broadcast_callback == broadcaster
        # Check that game_started event was broadcast
        assert_event_generated(broadcaster, "game_started")


class TestCardDealing:
    """Test initial card dealing"""
    
    def test_each_player_gets_four_cards(self):
        """Test each player receives exactly 4 cards"""
        game = create_test_game(["Alice", "Bob", "Charlie", "Dave"])
        
        for i in range(4):
            assert_player_hand_size(game, i, 4)
    
    def test_players_know_first_two_cards(self):
        """Test players can see their first two cards initially"""
        game = create_test_game()
        
        for player_index in range(len(game.players)):
            assert_card_is_known(game, player_index, 0, True)
            assert_card_is_known(game, player_index, 1, True)
            assert_card_is_known(game, player_index, 2, False)
            assert_card_is_known(game, player_index, 3, False)
    
    def test_no_duplicate_cards_dealt(self):
        """Test no duplicate cards are dealt to players"""
        game = create_test_game(["Alice", "Bob"])
        
        all_dealt_cards = []
        for player in game.players:
            for card in player.hand:
                card_signature = (card.rank, card.suit)
                assert card_signature not in all_dealt_cards, f"Duplicate card dealt: {card}"
                all_dealt_cards.append(card_signature)
    
    def test_players_start_without_cabo_called(self):
        """Test players start with has_called_cabo = False"""
        game = create_test_game()
        
        for player in game.players:
            assert not player.has_called_cabo


class TestInitialGameState:
    """Test initial game state"""
    
    def test_no_drawn_card_initially(self):
        """Test no card is drawn initially"""
        game = create_test_game()
        assert game.state.drawn_card is None
    
    def test_no_played_card_initially(self):
        """Test no card is played initially"""
        game = create_test_game()
        assert game.state.played_card is None
    
    def test_no_stack_caller_initially(self):
        """Test no stack caller initially"""
        game = create_test_game()
        assert game.state.stack_caller is None
        assert game.state.stack_timer_id is None
    
    def test_no_cabo_caller_initially(self):
        """Test no cabo caller initially"""
        game = create_test_game()
        assert game.state.cabo_caller is None
        assert not game.state.final_round_started
    
    def test_no_winner_initially(self):
        """Test no winner initially"""
        game = create_test_game()
        assert game.state.winner is None
    
    def test_empty_discard_pile_initially(self):
        """Test discard pile is empty initially"""
        game = create_test_game()
        assert len(game.discard_pile) == 0
    
    def test_empty_message_queue_initially(self):
        """Test message queue is empty initially"""
        game = create_test_game()
        assert game.message_queue.empty()
    
    def test_no_pending_timeouts_initially(self):
        """Test no pending timeouts initially"""
        game = create_test_game()
        assert len(game.pending_timeouts) == 0


class TestGameStateVisibility:
    """Test game state visibility from different player perspectives"""
    
    def test_player_sees_own_known_cards(self):
        """Test player can see their own known cards in game state"""
        game = create_test_game(["Alice", "Bob"])
        alice_id = game.players[0].player_id
        
        state = game.get_game_state(alice_id)
        alice_player_state = state["players"][0]
        
        # Alice should see her first two cards (known), but not the last two
        hand = alice_player_state["hand"]
        assert hand[0] is not None  # Known card
        assert hand[1] is not None  # Known card
        assert hand[2] is None      # Unknown card
        assert hand[3] is None      # Unknown card
    
    def test_player_cannot_see_opponent_cards(self):
        """Test player cannot see opponent's cards in game state"""
        game = create_test_game(["Alice", "Bob"])
        alice_id = game.players[0].player_id
        
        state = game.get_game_state(alice_id)
        bob_player_state = state["players"][1]
        
        # Alice should not see Bob's hand at all
        assert "hand" not in bob_player_state
        assert bob_player_state["hand_size"] == 4
    
    def test_game_state_includes_basic_info(self):
        """Test game state includes basic game information"""
        game = create_test_game(["Alice", "Bob"])
        alice_id = game.players[0].player_id
        
        state = game.get_game_state(alice_id)
        
        assert "game_id" in state
        assert "phase" in state
        assert "current_player" in state
        assert "players" in state
        assert "deck_size" in state
        assert state["phase"] == "playing"
        assert len(state["players"]) == 2
    
    def test_invalid_player_id_returns_error(self):
        """Test requesting game state with invalid player ID returns error"""
        game = create_test_game()
        
        state = game.get_game_state("invalid_player_id")
        assert "error" in state
        assert state["error"] == "Player not found"


class TestTwoPlayerGame:
    """Test game works correctly with minimum players"""
    
    def test_two_player_game_initializes_correctly(self):
        """Test game can be created with just two players"""
        game = create_test_game(["Alice", "Bob"])
        
        assert len(game.players) == 2
        assert_player_hand_size(game, 0, 4)
        assert_player_hand_size(game, 1, 4)
        assert_game_phase(game, GamePhase.PLAYING)
    
    def test_current_player_valid_in_two_player_game(self):
        """Test current player index is valid in two-player game"""
        game = create_test_game(["Alice", "Bob"])
        assert game.state.current_player_index in [0, 1]


class TestManyPlayerGame:
    """Test game works correctly with maximum reasonable players"""
    
    def test_six_player_game_initializes_correctly(self):
        """Test game can be created with six players"""
        player_names = ["Alice", "Bob", "Charlie", "Dave", "Eve", "Frank"]
        game = create_test_game(player_names)
        
        assert len(game.players) == 6
        for i in range(6):
            assert_player_hand_size(game, i, 4)
        
        # Deck should have 54 - (6 * 4) = 30 cards remaining
        assert game.deck.size() == 30
        assert_game_phase(game, GamePhase.PLAYING)
    
    def test_current_player_valid_in_six_player_game(self):
        """Test current player index is valid in six-player game"""
        player_names = ["Alice", "Bob", "Charlie", "Dave", "Eve", "Frank"]
        game = create_test_game(player_names)
        assert 0 <= game.state.current_player_index < 6