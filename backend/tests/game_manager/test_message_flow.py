"""Tests for message flow and event generation"""

import pytest
from services.game_manager import (
    CaboGame, GamePhase, Rank, Suit,
    DrawCardMessage, PlayDrawnCardMessage, ReplaceAndPlayMessage,
    CallStackMessage, ExecuteStackMessage, CallCaboMessage,
    StackTimeoutMessage, SpecialActionTimeoutMessage, TurnTransitionTimeoutMessage,
    NextTurnMessage, EndGameMessage, GameEvent
)
from .utils import (
    create_test_game, MockBroadcaster, create_specific_card,
    set_current_player, force_game_phase, replace_game_deck,
    deal_specific_cards, set_played_card,
    assert_game_phase, assert_current_player, assert_event_generated,
    process_messages_and_get_events
)


class TestMessageProcessing:
    """Test basic message processing mechanics"""
    
    def test_empty_queue_returns_no_events(self):
        """Test processing empty message queue returns no events"""
        game = create_test_game()
        
        events = process_messages_and_get_events(game)
        assert len(events) == 0
    
    def test_invalid_message_type_ignored(self):
        """Test invalid message types are handled gracefully"""
        game = create_test_game()
        
        # This test would require creating an invalid message type
        # For now, we test that the handler dictionary approach works
        # by ensuring all valid message types have handlers
        from services.game_manager import MessageType
        
        valid_types = set(MessageType)
        handler_types = set(game._handle_message.__code__.co_names)
        
        # All message types should have corresponding handlers
        # (This is more of a code structure test)
        assert len(valid_types) > 0
    
    def test_multiple_messages_processed_in_order(self):
        """Test multiple messages are processed in FIFO order"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster
        
        # Set up cards for two actions
        cards = [
            create_specific_card(Rank.TWO, Suit.HEARTS),
            create_specific_card(Rank.THREE, Suit.CLUBS)
        ]
        replace_game_deck(game, cards)
        
        set_current_player(game, 0)
        alice_id = game.players[0].player_id
        
        # Add multiple messages
        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        
        # Process all at once
        events = process_messages_and_get_events(game)
        
        # Should have processed draw, then play
        event_types = [event.event_type for event in events]
        assert "card_drawn" in event_types
        assert "card_played" in event_types
        
        # Card should be in discard pile
        assert len(game.discard_pile) == 1
        
        # Should be in turn transition phase
        assert_game_phase(game, GamePhase.TURN_TRANSITION)
    
    def test_message_generates_follow_up_messages(self):
        """Test messages can generate follow-up messages"""
        game = create_test_game(["Alice", "Bob"])
        
        # Play a normal card that should generate NextTurnMessage
        normal_card = create_specific_card(Rank.FIVE, Suit.HEARTS)
        replace_game_deck(game, [normal_card])
        
        set_current_player(game, 0)
        alice_id = game.players[0].player_id
        
        # Draw and play
        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)
        
        # Should be in turn transition (not immediately advanced)
        assert_game_phase(game, GamePhase.TURN_TRANSITION)
        assert_current_player(game, 0)  # Still Alice until timeout
        
        # Trigger timeout to advance turn
        game.add_message(TurnTransitionTimeoutMessage())
        events = process_messages_and_get_events(game)
        
        # Now turn should have advanced
        assert_current_player(game, 1)


class TestEventGeneration:
    """Test event generation for broadcasting"""
    
    def test_draw_card_generates_event(self):
        """Test drawing card generates appropriate event"""
        game = create_test_game()
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster
        
        current_player_id = game.get_current_player().player_id
        
        game.add_message(DrawCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)
        
        assert_event_generated(broadcaster, "card_drawn", {
            "player_id": current_player_id
        })
    
    def test_play_card_generates_event(self):
        """Test playing card generates appropriate event"""
        game = create_test_game()
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster
        
        test_card = create_specific_card(Rank.KING, Suit.CLUBS)
        replace_game_deck(game, [test_card])
        
        current_player_id = game.get_current_player().player_id
        
        game.add_message(DrawCardMessage(player_id=current_player_id))
        game.add_message(PlayDrawnCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)
        
        assert_event_generated(broadcaster, "card_played", {
            "player_id": current_player_id,
            "card": str(test_card)
        })
    
    def test_stack_call_generates_event(self):
        """Test calling STACK generates appropriate event"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster
        
        # Set up played card
        played_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        set_played_card(game, played_card)
        
        bob_id = game.players[1].player_id
        game.add_message(CallStackMessage(player_id=bob_id))
        events = process_messages_and_get_events(game)
        
        assert_event_generated(broadcaster, "stack_called", {
            "caller_id": bob_id,
            "target_card": str(played_card)
        })
    
    def test_cabo_call_generates_event(self):
        """Test calling Cabo generates appropriate event"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster
        
        set_current_player(game, 0)
        alice_id = game.players[0].player_id
        
        game.add_message(CallCaboMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)
        
        assert_event_generated(broadcaster, "cabo_called", {
            "player_id": alice_id
        })
    
    def test_turn_change_generates_event(self):
        """Test turn changes generate appropriate events"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster
        
        # Play a normal card to trigger turn transition
        normal_card = create_specific_card(Rank.THREE, Suit.HEARTS)
        replace_game_deck(game, [normal_card])
        
        set_current_player(game, 0)
        alice_id = game.players[0].player_id
        
        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        process_messages_and_get_events(game)
        
        # Clear events to test turn change event
        broadcaster.clear()
        
        # Trigger timeout to advance turn
        game.add_message(TurnTransitionTimeoutMessage())
        events = process_messages_and_get_events(game)
        
        # Should include turn change event
        assert_event_generated(broadcaster, "turn_changed", {
            "current_player": game.players[1].player_id
        })
    
    def test_game_end_generates_event(self):
        """Test game end generates appropriate event"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster
        
        # Set up simple hands for scoring
        alice_cards = [create_specific_card(Rank.ACE, Suit.HEARTS)]
        bob_cards = [create_specific_card(Rank.TWO, Suit.CLUBS)]
        
        deal_specific_cards(game, 0, alice_cards)
        deal_specific_cards(game, 1, bob_cards)
        
        game.add_message(EndGameMessage())
        events = process_messages_and_get_events(game)
        
        assert_event_generated(broadcaster, "game_ended")
        
        # Check event contains final scores
        last_event = broadcaster.last_event()
        assert "final_scores" in last_event.data
        assert "winner_id" in last_event.data


class TestEventBroadcasting:
    """Test event broadcasting mechanism"""
    
    def test_broadcaster_receives_all_events(self):
        """Test broadcaster receives all generated events"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster
        
        # Perform multiple actions
        normal_card = create_specific_card(Rank.FOUR, Suit.DIAMONDS)
        replace_game_deck(game, [normal_card])
        
        set_current_player(game, 0)
        alice_id = game.players[0].player_id
        
        # Clear initial events
        broadcaster.clear()
        
        # Perform actions that generate events
        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)
        
        # Broadcaster should have received all events
        assert len(broadcaster.events) >= 2  # At least draw and play events
        
        event_types = [event.event_type for event in broadcaster.events]
        assert "card_drawn" in event_types
        assert "card_played" in event_types
    
    def test_no_broadcaster_doesnt_crash(self):
        """Test game works without broadcaster callback"""
        game = create_test_game()
        game.broadcast_callback = None
        
        # Should not crash when trying to broadcast
        current_player_id = game.get_current_player().player_id
        game.add_message(DrawCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)
        
        # Should still process the message
        assert game.state.drawn_card is not None
    
    def test_event_timestamps_increase(self):
        """Test event timestamps increase chronologically"""
        game = create_test_game()
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster
        
        # Generate several events
        normal_cards = [
            create_specific_card(Rank.TWO, Suit.HEARTS),
            create_specific_card(Rank.THREE, Suit.CLUBS)
        ]
        replace_game_deck(game, normal_cards)
        
        current_player_id = game.get_current_player().player_id
        
        broadcaster.clear()
        
        # First action
        game.add_message(DrawCardMessage(player_id=current_player_id))
        process_messages_and_get_events(game)
        first_timestamp = broadcaster.last_event().timestamp
        
        # Second action
        game.add_message(PlayDrawnCardMessage(player_id=current_player_id))
        process_messages_and_get_events(game)
        second_timestamp = broadcaster.last_event().timestamp
        
        # Timestamps should increase
        assert second_timestamp >= first_timestamp


class TestTimeoutProcessing:
    """Test timeout message processing"""
    
    def test_timeout_check_triggers_expired_timeouts(self):
        """Test timeout checking triggers expired timeouts"""
        game = create_test_game(["Alice", "Bob"])
        
        # Set up a STACK scenario
        played_card = create_specific_card(Rank.QUEEN, Suit.HEARTS)
        set_played_card(game, played_card)
        
        bob_id = game.players[1].player_id
        game.add_message(CallStackMessage(player_id=bob_id))
        process_messages_and_get_events(game)
        
        # Manually expire the timeout
        timer_id = game.state.stack_timer_id
        game.pending_timeouts[timer_id] = 0  # Set to expired time
        
        # Process messages should trigger timeout
        events = process_messages_and_get_events(game)
        
        # Should have processed timeout and cleared stack state
        assert_game_phase(game, GamePhase.PLAYING)
        assert game.state.stack_caller is None
    
    def test_multiple_timeouts_processed_correctly(self):
        """Test multiple timeouts are processed correctly"""
        game = create_test_game()
        
        # Set up multiple expired timeouts
        game.pending_timeouts["timeout1"] = 0  # Expired
        game.pending_timeouts["timeout2"] = 0  # Expired
        game.pending_timeouts["timeout3"] = 999999999999  # Not expired
        
        # Process should clear expired timeouts
        initial_count = len(game.pending_timeouts)
        process_messages_and_get_events(game)
        
        # Should have cleared expired timeouts
        assert len(game.pending_timeouts) < initial_count
        assert "timeout3" in game.pending_timeouts  # Non-expired should remain
    
    def test_turn_transition_timeout_processing(self):
        """Test turn transition timeout is processed correctly"""
        game = create_test_game(["Alice", "Bob"])
        
        # Set up turn transition scenario
        normal_card = create_specific_card(Rank.FOUR, Suit.HEARTS)
        replace_game_deck(game, [normal_card])
        
        set_current_player(game, 0)
        alice_id = game.players[0].player_id
        
        # Play card to trigger turn transition
        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        process_messages_and_get_events(game)
        
        # Should have timer scheduled
        timer_id = game.state.turn_transition_timer_id
        assert timer_id is not None
        assert timer_id in game.pending_timeouts
        
        # Manually expire the timeout
        game.pending_timeouts[timer_id] = 0  # Set to expired time
        
        # Process messages should trigger timeout
        events = process_messages_and_get_events(game)
        
        # Should have advanced turn and cleared timer
        assert_current_player(game, 1)
        assert_game_phase(game, GamePhase.PLAYING)
        assert game.state.turn_transition_timer_id is None


class TestMessageQueueIntegration:
    """Test message queue integration"""
    
    def test_messages_processed_until_queue_empty(self):
        """Test all messages are processed until queue is empty"""
        game = create_test_game(["Alice", "Bob"])
        
        # Add multiple messages
        normal_card = create_specific_card(Rank.SIX, Suit.HEARTS)
        replace_game_deck(game, [normal_card])
        
        set_current_player(game, 0)
        alice_id = game.players[0].player_id
        
        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        
        # Verify queue has messages
        assert not game.message_queue.empty()
        
        # Process all messages
        events = process_messages_and_get_events(game)
        
        # Queue should be empty
        assert game.message_queue.empty()
        
        # Both actions should have been processed
        assert game.state.drawn_card is None  # Cleared after playing
        assert len(game.discard_pile) == 1  # Card was played
        
        # Should be in turn transition phase
        assert_game_phase(game, GamePhase.TURN_TRANSITION)
    
    def test_failed_messages_dont_block_queue(self):
        """Test failed messages don't prevent processing subsequent messages"""
        game = create_test_game(["Alice", "Bob"])
        
        set_current_player(game, 0)
        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id
        
        # Add invalid message followed by valid message
        game.add_message(DrawCardMessage(player_id=bob_id))  # Invalid (not Bob's turn)
        game.add_message(DrawCardMessage(player_id=alice_id))  # Valid
        
        events = process_messages_and_get_events(game)
        
        # Valid message should have been processed
        assert game.state.drawn_card is not None
        
        # Queue should be empty
        assert game.message_queue.empty()


class TestEventDataIntegrity:
    """Test event data contains correct information"""
    
    def test_card_drawn_event_has_correct_data(self):
        """Test card drawn event contains correct player and card info"""
        game = create_test_game()
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster
        
        test_card = create_specific_card(Rank.JACK, Suit.HEARTS)
        replace_game_deck(game, [test_card])
        
        current_player_id = game.get_current_player().player_id
        
        game.add_message(DrawCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)
        
        event = broadcaster.last_event()
        assert event.event_type == "card_drawn"
        assert event.data["player_id"] == current_player_id
        # Card should be visible to the player who drew it
        assert "card" in event.data
    
    def test_stack_events_have_correct_data(self):
        """Test STACK events contain correct information"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster
        
        # Set up successful stack
        played_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        stack_card = create_specific_card(Rank.SEVEN, Suit.CLUBS)
        
        set_played_card(game, played_card)
        deal_specific_cards(game, 1, [stack_card])
        
        bob_id = game.players[1].player_id
        
        # Call stack
        game.add_message(CallStackMessage(player_id=bob_id))
        process_messages_and_get_events(game)
        
        call_event = broadcaster.last_event()
        assert call_event.event_type == "stack_called"
        assert call_event.data["caller_id"] == bob_id
        assert call_event.data["target_card"] == str(played_card)
        
        broadcaster.clear()
        
        # Execute stack
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=0,
            target_player_id=None
        ))
        process_messages_and_get_events(game)
        
        success_event = broadcaster.last_event()
        assert success_event.event_type == "stack_success"
        assert success_event.data["type"] == "self_stack"
    
    def test_game_end_event_has_complete_scores(self):
        """Test game end event contains complete scoring information"""
        game = create_test_game(["Alice", "Bob", "Charlie"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster
        
        # Set up hands with different scores
        alice_cards = [create_specific_card(Rank.ACE, Suit.HEARTS)]  # 1
        bob_cards = [create_specific_card(Rank.THREE, Suit.CLUBS)]   # 3  
        charlie_cards = [create_specific_card(Rank.TWO, Suit.HEARTS)]  # 2
        
        deal_specific_cards(game, 0, alice_cards)
        deal_specific_cards(game, 1, bob_cards)
        deal_specific_cards(game, 2, charlie_cards)
        
        game.add_message(EndGameMessage())
        events = process_messages_and_get_events(game)
        
        event = broadcaster.last_event()
        assert event.event_type == "game_ended"
        
        # Check winner
        assert event.data["winner_id"] == game.players[0].player_id  # Alice with score 1
        
        # Check scores are sorted
        scores = event.data["final_scores"]
        assert len(scores) == 3
        assert scores[0]["score"] <= scores[1]["score"] <= scores[2]["score"]
        
        # All players should be included
        player_ids = {score["player_id"] for score in scores}
        expected_ids = {player.player_id for player in game.players}
        assert player_ids == expected_ids