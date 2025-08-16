"""Tests for STACK mechanics including two-phase system and timeouts"""

import pytest
from services.game_manager import (
    CaboGame, GamePhase, Rank, Suit,
    CallStackMessage, ExecuteStackMessage, StackTimeoutMessage,
    DrawCardMessage, PlayDrawnCardMessage
)
from .utils import (
    create_test_game, MockBroadcaster, create_specific_card,
    setup_stack_scenario, deal_specific_cards, set_played_card,
    force_game_phase, set_current_player, replace_game_deck,
    assert_player_hand_size, assert_player_has_card, assert_game_phase,
    assert_current_player, assert_discard_top, assert_event_generated,
    process_messages_and_get_events, MATCHING_PAIR, NON_MATCHING_PAIR, assert_turn_advances_to
)


class TestStackCalling:
    """Test the first phase of STACK - calling STACK"""

    def test_player_can_call_stack_on_played_card(self):
        """Test player can call STACK when a card has been played"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Set up a played card
        played_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        set_played_card(game, played_card)

        # Bob calls STACK
        bob_id = game.players[1].player_id
        game.add_message(CallStackMessage(player_id=bob_id))
        events = process_messages_and_get_events(game)

        assert_game_phase(game, GamePhase.STACK_CALLED)
        assert game.state.stack_caller == bob_id
        assert game.state.stack_timer_id is not None

        assert_event_generated(broadcaster, "stack_called", {
            "caller_id": bob_id,
            "target_card": str(played_card)
        })

    def test_cannot_call_stack_without_played_card(self):
        """Test cannot call STACK when no card has been played"""
        game = create_test_game(["Alice", "Bob"])
        bob_id = game.players[1].player_id

        # Try to call STACK without any played card
        game.add_message(CallStackMessage(player_id=bob_id))
        events = process_messages_and_get_events(game)

        assert len(events) == 0
        assert_game_phase(game, GamePhase.PLAYING)
        assert game.state.stack_caller is None

    def test_second_stack_call_rejected(self):
        """Test second player cannot call STACK after first player already called"""
        game = create_test_game(["Alice", "Bob", "Charlie"])

        # Set up played card
        played_card = create_specific_card(Rank.KING, Suit.CLUBS)
        set_played_card(game, played_card)

        bob_id = game.players[1].player_id
        charlie_id = game.players[2].player_id

        # Bob calls STACK first
        game.add_message(CallStackMessage(player_id=bob_id))
        process_messages_and_get_events(game)

        assert game.state.stack_caller == bob_id

        # Charlie tries to call STACK
        game.add_message(CallStackMessage(player_id=charlie_id))
        events = process_messages_and_get_events(game)

        # Should still be Bob's stack
        assert game.state.stack_caller == bob_id
        assert len(events) == 0  # No new events from Charlie's failed attempt

    def test_stack_call_creates_timer(self):
        """Test calling STACK creates a timeout timer"""
        game = create_test_game(["Alice", "Bob"])

        played_card = create_specific_card(Rank.ACE, Suit.SPADES)
        set_played_card(game, played_card)

        bob_id = game.players[1].player_id
        game.add_message(CallStackMessage(player_id=bob_id))
        process_messages_and_get_events(game)

        assert game.state.stack_timer_id is not None
        assert game.state.stack_timer_id in game.pending_timeouts


class TestStackExecution:
    """Test the second phase of STACK - executing the stack"""

    def test_successful_self_stack_with_matching_card(self):
        """Test successful self-stack with matching rank card"""
        game = create_test_game(["Alice", "Bob"])

        # Set up matching cards
        played_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        stack_card = create_specific_card(Rank.SEVEN, Suit.CLUBS)

        broadcaster = setup_stack_scenario(game, 1, played_card, stack_card)
        bob_id = game.players[1].player_id

        # Execute stack (self-stack, no target player)
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=0,
            target_player_id=None
        ))
        events = process_messages_and_get_events(game)

        # Check Bob's hand decreased by 1
        assert_player_hand_size(game, 1, 0)

        # Check card went to discard pile
        assert_discard_top(game, stack_card)

        # Check game state cleared
        assert_game_phase(game, GamePhase.PLAYING)
        assert game.state.stack_caller is None
        assert game.state.stack_timer_id is None

        assert_event_generated(broadcaster, "stack_success", {
            "type": "self_stack"
        })

    def test_successful_opponent_stack_with_matching_card(self):
        """Test successful opponent-stack with matching rank card"""
        game = create_test_game(["Alice", "Bob", "Charlie"])

        played_card = create_specific_card(Rank.QUEEN, Suit.HEARTS)
        stack_card = create_specific_card(Rank.QUEEN, Suit.DIAMONDS)

        broadcaster = setup_stack_scenario(game, 1, played_card, stack_card)
        bob_id = game.players[1].player_id
        alice_id = game.players[0].player_id

        # Bob stacks on Alice
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=0,
            target_player_id=alice_id
        ))
        events = process_messages_and_get_events(game)

        # Check Bob's hand decreased
        assert_player_hand_size(game, 1, 0)

        # Check Alice's hand increased
        assert_player_hand_size(game, 0, 5)  # Started with 4, got 1 more
        assert_player_has_card(game, 0, stack_card)

        # Check game state cleared
        assert_game_phase(game, GamePhase.PLAYING)

        assert_event_generated(broadcaster, "stack_success", {
            "type": "opponent_stack"
        })

    def test_failed_stack_with_non_matching_card(self):
        """Test failed stack with non-matching rank draws penalty card"""
        game = create_test_game(["Alice", "Bob"])

        # Set up non-matching cards
        played_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        stack_card = create_specific_card(Rank.EIGHT, Suit.CLUBS)

        # Add a card to deck for penalty draw
        penalty_card = create_specific_card(Rank.TWO, Suit.SPADES)
        replace_game_deck(game, [penalty_card])

        broadcaster = setup_stack_scenario(game, 1, played_card, stack_card)
        bob_id = game.players[1].player_id

        # Execute failed stack
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=0,
            target_player_id=None
        ))
        events = process_messages_and_get_events(game)

        # Check Bob's hand increased (penalty card)
        assert_player_hand_size(game, 1, 2)  # Had 1, got penalty, now 2

        # Check stack card stayed in hand
        assert_player_has_card(game, 1, stack_card)

        # Check penalty card was added
        assert_player_has_card(game, 1, penalty_card)

        # Check game state cleared
        assert_game_phase(game, GamePhase.PLAYING)

        assert_event_generated(broadcaster, "stack_failed")

    def test_cannot_execute_stack_if_not_caller(self):
        """Test player who didn't call STACK cannot execute it"""
        game = create_test_game(["Alice", "Bob", "Charlie"])

        played_card = create_specific_card(Rank.KING, Suit.HEARTS)
        stack_card = create_specific_card(Rank.KING, Suit.CLUBS)

        # Bob calls STACK
        setup_stack_scenario(game, 1, played_card, stack_card)
        charlie_id = game.players[2].player_id

        # Charlie tries to execute (but Bob called)
        game.add_message(ExecuteStackMessage(
            player_id=charlie_id,
            card_index=0,
            target_player_id=None
        ))
        events = process_messages_and_get_events(game)

        # Should still be in STACK_CALLED phase
        assert_game_phase(game, GamePhase.STACK_CALLED)
        assert len(events) == 0

    def test_cannot_execute_stack_with_invalid_card_index(self):
        """Test cannot execute stack with invalid card index"""
        game = create_test_game(["Alice", "Bob"])

        played_card = create_specific_card(Rank.ACE, Suit.HEARTS)
        stack_card = create_specific_card(Rank.ACE, Suit.CLUBS)

        setup_stack_scenario(game, 1, played_card, stack_card)
        bob_id = game.players[1].player_id

        # Try to execute with invalid index
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=5,  # Invalid index
            target_player_id=None
        ))
        events = process_messages_and_get_events(game)

        assert_game_phase(game, GamePhase.STACK_CALLED)
        assert len(events) == 0

    def test_cannot_execute_stack_with_invalid_target_player(self):
        """Test cannot execute opponent stack with invalid target player"""
        game = create_test_game(["Alice", "Bob"])

        played_card = create_specific_card(Rank.JACK, Suit.HEARTS)
        stack_card = create_specific_card(Rank.JACK, Suit.SPADES)

        setup_stack_scenario(game, 1, played_card, stack_card)
        bob_id = game.players[1].player_id

        # Try to execute with invalid target
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=0,
            target_player_id="invalid_player"
        ))
        events = process_messages_and_get_events(game)

        # Should fail but clear stack state
        assert_game_phase(game, GamePhase.PLAYING)
        assert len(events) == 0


class TestStackTimeout:
    """Test STACK timeout mechanics"""

    def test_stack_timeout_applies_penalty(self):
        """Test STACK timeout applies penalty card to caller"""
        game = create_test_game(["Alice", "Bob"])

        # Set up stack scenario
        played_card = create_specific_card(Rank.FIVE, Suit.HEARTS)
        stack_card = create_specific_card(Rank.FIVE, Suit.CLUBS)

        # Add penalty card to deck
        penalty_card = create_specific_card(Rank.THREE, Suit.DIAMONDS)
        replace_game_deck(game, [penalty_card])

        broadcaster = setup_stack_scenario(game, 1, played_card, stack_card)
        game.broadcast_callback = broadcaster

        # Manually trigger timeout
        game.add_message(StackTimeoutMessage())
        process_messages_and_get_events(game)

        # Check Bob got penalty card
        assert_player_hand_size(game, 1, 2)  # Had 1, got penalty, now 2
        assert_player_has_card(game, 1, penalty_card)

        # Check game state cleared
        assert_game_phase(game, GamePhase.PLAYING)
        assert game.state.stack_caller is None

        assert_event_generated(broadcaster, "stack_timeout")

    def test_stack_timeout_clears_timer(self):
        """Test STACK timeout clears the timer"""
        game = create_test_game(["Alice", "Bob"])

        played_card = create_specific_card(Rank.TWO, Suit.HEARTS)
        stack_card = create_specific_card(Rank.TWO, Suit.CLUBS)

        setup_stack_scenario(game, 1, played_card, stack_card)
        timer_id = game.state.stack_timer_id

        # Trigger timeout
        game.add_message(StackTimeoutMessage())
        process_messages_and_get_events(game)

        # Check timer was cleared
        assert game.state.stack_timer_id is None
        assert timer_id not in game.pending_timeouts

    def test_stack_timeout_advances_turn(self):
        """Test STACK timeout advances to next turn"""
        game = create_test_game(["Alice", "Bob", "Charlie"])

        played_card = create_specific_card(Rank.NINE, Suit.HEARTS)
        stack_card = create_specific_card(Rank.NINE, Suit.CLUBS)

        # Set up so Alice is current player when timeout happens
        set_current_player(game, 0)
        setup_stack_scenario(game, 1, played_card, stack_card)

        # Trigger timeout
        game.add_message(StackTimeoutMessage())
        process_messages_and_get_events(game)

        # Should advance to next player (Bob in this case, since Alice was current)
        assert_turn_advances_to(game, 1)

    def test_timeout_when_not_in_stack_phase_ignored(self):
        """Test timeout message is ignored when not in STACK phase"""
        game = create_test_game(["Alice", "Bob"])

        # Game is in normal PLAYING phase
        assert_game_phase(game, GamePhase.PLAYING)

        # Send timeout message
        game.add_message(StackTimeoutMessage())
        events = process_messages_and_get_events(game)

        # Should remain in PLAYING phase, no events
        assert_game_phase(game, GamePhase.PLAYING)
        assert len(events) == 0


class TestStackIntegrationWithTurns:
    """Test STACK integration with normal turn flow"""

    def test_successful_stack_advances_turn_normally(self):
        """Test successful stack advances turn normally after completion"""
        game = create_test_game(["Alice", "Bob", "Charlie"])

        # Set Alice as current player
        set_current_player(game, 0)

        # Alice plays a card
        played_card = create_specific_card(Rank.TEN, Suit.HEARTS)
        normal_card = create_specific_card(Rank.FOUR, Suit.CLUBS)
        replace_game_deck(game, [normal_card])

        alice_id = game.players[0].player_id
        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        process_messages_and_get_events(game)

        # Bob calls and executes successful stack
        bob_id = game.players[1].player_id
        stack_card = create_specific_card(Rank.TEN, Suit.CLUBS)
        deal_specific_cards(game, 1, [stack_card])

        game.add_message(CallStackMessage(player_id=bob_id))
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=0,
            target_player_id=None
        ))
        process_messages_and_get_events(game)

        # Turn should advance to Bob (index 1) since Alice was current
        assert_turn_advances_to(game, 1)

    def test_failed_stack_advances_turn_normally(self):
        """Test failed stack advances turn normally after completion"""
        game = create_test_game(["Alice", "Bob", "Charlie"])

        # Similar setup but with non-matching cards
        set_current_player(game, 0)

        played_card = create_specific_card(Rank.JACK, Suit.HEARTS)
        wrong_card = create_specific_card(Rank.QUEEN, Suit.CLUBS)
        penalty_card = create_specific_card(Rank.TWO, Suit.DIAMONDS)

        replace_game_deck(game, [penalty_card, played_card])

        alice_id = game.players[0].player_id
        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        process_messages_and_get_events(game)

        # Bob calls and executes failed stack
        bob_id = game.players[1].player_id
        deal_specific_cards(game, 1, [wrong_card])

        game.add_message(CallStackMessage(player_id=bob_id))
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=0,
            target_player_id=None
        ))
        process_messages_and_get_events(game)

        # Turn should still advance normally
        assert_turn_advances_to(game, 1)


class TestStackStateClearing:
    """Test STACK state is properly cleared in all scenarios"""

    def test_successful_stack_clears_all_state(self):
        """Test successful stack clears all STACK-related state"""
        game = create_test_game(["Alice", "Bob"])

        played_card = create_specific_card(Rank.KING, Suit.HEARTS)
        stack_card = create_specific_card(Rank.KING, Suit.CLUBS)

        setup_stack_scenario(game, 1, played_card, stack_card)
        timer_id = game.state.stack_timer_id
        bob_id = game.players[1].player_id

        # Execute successful stack
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=0,
            target_player_id=None
        ))
        process_messages_and_get_events(game)

        # Check all state cleared
        assert game.state.stack_caller is None
        assert game.state.stack_timer_id is None
        assert timer_id not in game.pending_timeouts
        assert_game_phase(game, GamePhase.PLAYING)

    def test_failed_stack_clears_all_state(self):
        """Test failed stack clears all STACK-related state"""
        game = create_test_game(["Alice", "Bob"])

        played_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        stack_card = create_specific_card(Rank.EIGHT, Suit.CLUBS)
        penalty_card = create_specific_card(Rank.THREE, Suit.DIAMONDS)

        replace_game_deck(game, [penalty_card])
        setup_stack_scenario(game, 1, played_card, stack_card)
        timer_id = game.state.stack_timer_id
        bob_id = game.players[1].player_id

        # Execute failed stack
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=0,
            target_player_id=None
        ))
        process_messages_and_get_events(game)

        # Check all state cleared
        assert game.state.stack_caller is None
        assert game.state.stack_timer_id is None
        assert timer_id not in game.pending_timeouts
        assert_game_phase(game, GamePhase.PLAYING)

    def test_timeout_clears_all_state(self):
        """Test timeout clears all STACK-related state"""
        game = create_test_game(["Alice", "Bob"])

        played_card = create_specific_card(Rank.FOUR, Suit.HEARTS)
        stack_card = create_specific_card(Rank.FOUR, Suit.CLUBS)

        setup_stack_scenario(game, 1, played_card, stack_card)
        timer_id = game.state.stack_timer_id

        # Trigger timeout
        game.add_message(StackTimeoutMessage())
        process_messages_and_get_events(game)

        # Check all state cleared
        assert game.state.stack_caller is None
        assert game.state.stack_timer_id is None
        assert timer_id not in game.pending_timeouts
        assert_game_phase(game, GamePhase.PLAYING)
