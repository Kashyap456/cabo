"""Tests for error conditions and edge cases"""

import pytest
from services.game_manager import (
    CaboGame, GamePhase, Rank, Suit,
    DrawCardMessage, PlayDrawnCardMessage, ReplaceAndPlayMessage,
    CallStackMessage, ExecuteStackMessage, CallCaboMessage,
    ViewOwnCardMessage, ViewOpponentCardMessage, SwapCardsMessage,
    KingViewCardMessage, KingSwapCardsMessage, KingSkipSwapMessage,
    EndGameMessage
)
from .utils import (
    create_test_game, MockBroadcaster, create_specific_card,
    set_current_player, force_game_phase, replace_game_deck,
    deal_specific_cards, set_played_card, set_drawn_card,
    assert_game_phase, assert_current_player, assert_player_hand_size,
    process_messages_and_get_events, assert_turn_advances_to
)


class TestInvalidPlayerActions:
    """Test actions by invalid or wrong players"""
    
    def test_nonexistent_player_actions_ignored(self):
        """Test actions by nonexistent players are ignored"""
        game = create_test_game(["Alice", "Bob"])
        
        # Try action with invalid player ID
        game.add_message(DrawCardMessage(player_id="nonexistent_player"))
        events = process_messages_and_get_events(game)
        
        # Should be ignored
        assert len(events) == 0
        assert game.state.drawn_card is None
    
    def test_wrong_player_turn_actions_ignored(self):
        """Test actions by wrong player during their turn are ignored"""
        game = create_test_game(["Alice", "Bob"])
        
        # Set Alice as current player
        set_current_player(game, 0)
        bob_id = game.players[1].player_id
        
        # Bob tries to act on Alice's turn
        game.add_message(DrawCardMessage(player_id=bob_id))
        events = process_messages_and_get_events(game)
        
        assert len(events) == 0
        assert game.state.drawn_card is None
        assert_current_player(game, 0)  # Still Alice's turn
    
    def test_actions_in_wrong_game_phase_ignored(self):
        """Test actions in wrong game phase are ignored"""
        game = create_test_game(["Alice", "Bob"])
        
        # Force game into ended phase
        force_game_phase(game, GamePhase.ENDED)
        
        alice_id = game.players[0].player_id
        game.add_message(DrawCardMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)
        
        assert len(events) == 0
        assert_game_phase(game, GamePhase.ENDED)


class TestInvalidCardIndices:
    """Test handling of invalid card indices"""
    
    def test_replace_with_negative_index_ignored(self):
        """Test replace and play with negative index is ignored"""
        game = create_test_game()
        
        # Draw a card first
        test_card = create_specific_card(Rank.FIVE, Suit.HEARTS)
        replace_game_deck(game, [test_card])
        
        current_player_id = game.get_current_player().player_id
        game.add_message(DrawCardMessage(player_id=current_player_id))
        process_messages_and_get_events(game)
        
        # Try replace with negative index
        game.add_message(ReplaceAndPlayMessage(
            player_id=current_player_id, 
            hand_index=-1
        ))
        events = process_messages_and_get_events(game)
        
        # Should be ignored
        assert len(events) == 0
        assert len(game.discard_pile) == 0
        assert game.state.drawn_card is not None  # Card still drawn
    
    def test_replace_with_too_large_index_ignored(self):
        """Test replace and play with index too large is ignored"""
        game = create_test_game()
        
        test_card = create_specific_card(Rank.FIVE, Suit.HEARTS)
        replace_game_deck(game, [test_card])
        
        current_player_id = game.get_current_player().player_id
        game.add_message(DrawCardMessage(player_id=current_player_id))
        process_messages_and_get_events(game)
        
        # Try replace with too large index
        game.add_message(ReplaceAndPlayMessage(
            player_id=current_player_id, 
            hand_index=100
        ))
        events = process_messages_and_get_events(game)
        
        assert len(events) == 0
        assert len(game.discard_pile) == 0
    
    def test_view_own_card_invalid_index_ignored(self):
        """Test viewing own card with invalid index is ignored"""
        game = create_test_game()
        
        # Set up special action scenario
        force_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        game.state.special_action_player = game.players[0].player_id
        game.state.special_action_type = "view_own"
        
        alice_id = game.players[0].player_id
        
        # Try invalid indices
        invalid_indices = [-1, 4, 100]
        for index in invalid_indices:
            game.add_message(ViewOwnCardMessage(
                player_id=alice_id, 
                card_index=index
            ))
            events = process_messages_and_get_events(game)
            
            # Should still be waiting for special action
            assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
            assert len(events) == 0
    
    def test_swap_cards_invalid_indices_ignored(self):
        """Test swapping cards with invalid indices is ignored"""
        game = create_test_game(["Alice", "Bob"])
        
        # Set up special action scenario
        force_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        game.state.special_action_player = game.players[0].player_id
        game.state.special_action_type = "swap_opponent"
        
        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id
        
        # Try various invalid index combinations
        invalid_swaps = [
            (-1, 0),  # Negative own index
            (0, -1),  # Negative target index
            (10, 0),  # Own index too large
            (0, 10),  # Target index too large
        ]
        
        for own_idx, target_idx in invalid_swaps:
            game.add_message(SwapCardsMessage(
                player_id=alice_id,
                own_index=own_idx,
                target_player_id=bob_id,
                target_index=target_idx
            ))
            events = process_messages_and_get_events(game)
            
            assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
            assert len(events) == 0


class TestInvalidTargetPlayers:
    """Test handling of invalid target players"""
    
    def test_view_opponent_nonexistent_target_ignored(self):
        """Test viewing opponent card with nonexistent target is ignored"""
        game = create_test_game(["Alice", "Bob"])
        
        force_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        game.state.special_action_player = game.players[0].player_id
        game.state.special_action_type = "view_opponent"
        
        alice_id = game.players[0].player_id
        
        game.add_message(ViewOpponentCardMessage(
            player_id=alice_id,
            target_player_id="nonexistent_player",
            card_index=0
        ))
        events = process_messages_and_get_events(game)
        
        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert len(events) == 0
    
    def test_swap_with_nonexistent_target_ignored(self):
        """Test swapping with nonexistent target is ignored"""
        game = create_test_game(["Alice", "Bob"])
        
        force_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        game.state.special_action_player = game.players[0].player_id
        game.state.special_action_type = "swap_opponent"
        
        alice_id = game.players[0].player_id
        
        game.add_message(SwapCardsMessage(
            player_id=alice_id,
            own_index=0,
            target_player_id="nonexistent_player",
            target_index=0
        ))
        events = process_messages_and_get_events(game)
        
        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert len(events) == 0
    
    def test_execute_stack_on_nonexistent_target_fails(self):
        """Test executing stack on nonexistent target fails gracefully"""
        game = create_test_game(["Alice", "Bob"])
        
        # Set up stack scenario
        played_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        stack_card = create_specific_card(Rank.SEVEN, Suit.CLUBS)
        
        set_played_card(game, played_card)
        force_game_phase(game, GamePhase.STACK_CALLED)
        game.state.stack_caller = game.players[1].player_id
        
        deal_specific_cards(game, 1, [stack_card])
        
        bob_id = game.players[1].player_id
        
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=0,
            target_player_id="nonexistent_player"
        ))
        events = process_messages_and_get_events(game)
        
        # Should clear stack state even though execution failed
        assert_game_phase(game, GamePhase.PLAYING)
        assert len(events) == 0


class TestSelfTargeting:
    """Test invalid self-targeting scenarios"""
    
    def test_view_opponent_self_target_ignored(self):
        """Test viewing opponent effect cannot target yourself"""
        game = create_test_game(["Alice", "Bob"])
        
        force_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        game.state.special_action_player = game.players[0].player_id
        game.state.special_action_type = "view_opponent"
        
        alice_id = game.players[0].player_id
        
        game.add_message(ViewOpponentCardMessage(
            player_id=alice_id,
            target_player_id=alice_id,  # Self-targeting
            card_index=0
        ))
        events = process_messages_and_get_events(game)
        
        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert len(events) == 0
    
    def test_swap_with_self_ignored(self):
        """Test swapping cards with yourself is ignored"""
        game = create_test_game(["Alice", "Bob"])
        
        force_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        game.state.special_action_player = game.players[0].player_id
        game.state.special_action_type = "swap_opponent"
        
        alice_id = game.players[0].player_id
        
        game.add_message(SwapCardsMessage(
            player_id=alice_id,
            own_index=0,
            target_player_id=alice_id,  # Self-targeting
            target_index=1
        ))
        events = process_messages_and_get_events(game)
        
        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert len(events) == 0


class TestEmptyDeckScenarios:
    """Test scenarios with empty deck"""
    
    def test_draw_from_empty_deck_fails(self):
        """Test drawing from empty deck fails gracefully"""
        game = create_test_game()
        
        # Empty the deck
        game.deck.cards = []
        
        current_player_id = game.get_current_player().player_id
        game.add_message(DrawCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)
        
        assert len(events) == 0
        assert game.state.drawn_card is None
    
    def test_failed_stack_with_empty_deck_no_penalty(self):
        """Test failed stack with empty deck doesn't add penalty card"""
        game = create_test_game(["Alice", "Bob"])
        
        # Set up failed stack scenario
        played_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        wrong_card = create_specific_card(Rank.EIGHT, Suit.CLUBS)
        
        set_played_card(game, played_card)
        force_game_phase(game, GamePhase.STACK_CALLED)
        game.state.stack_caller = game.players[1].player_id
        
        deal_specific_cards(game, 1, [wrong_card])
        
        # Empty the deck
        game.deck.cards = []
        
        bob_id = game.players[1].player_id
        initial_hand_size = len(game.players[1].hand)
        
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=0,
            target_player_id=None
        ))
        events = process_messages_and_get_events(game)
        
        # Hand size should not increase (no penalty card available)
        assert_player_hand_size(game, 1, initial_hand_size)
        assert_game_phase(game, GamePhase.PLAYING)
    
    def test_stack_timeout_with_empty_deck_no_penalty(self):
        """Test stack timeout with empty deck doesn't add penalty card"""
        game = create_test_game(["Alice", "Bob"])
        
        # Set up stack scenario
        played_card = create_specific_card(Rank.QUEEN, Suit.HEARTS)
        set_played_card(game, played_card)
        force_game_phase(game, GamePhase.STACK_CALLED)
        game.state.stack_caller = game.players[1].player_id
        
        # Empty the deck
        game.deck.cards = []
        
        initial_hand_size = len(game.players[1].hand)
        
        # Trigger timeout
        from services.game_manager import StackTimeoutMessage
        game.add_message(StackTimeoutMessage())
        events = process_messages_and_get_events(game)
        
        # Hand size should not increase
        assert_player_hand_size(game, 1, initial_hand_size)
        assert_game_phase(game, GamePhase.PLAYING)


class TestConcurrentActionAttempts:
    """Test concurrent or conflicting action attempts"""
    
    def test_draw_twice_in_same_turn_fails(self):
        """Test attempting to draw twice in the same turn fails"""
        game = create_test_game()
        
        current_player_id = game.get_current_player().player_id
        
        # First draw succeeds
        game.add_message(DrawCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)
        assert len(events) == 1
        assert game.state.drawn_card is not None
        
        # Second draw fails
        game.add_message(DrawCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)
        assert len(events) == 0  # No new events
    
    def test_play_without_drawing_fails(self):
        """Test attempting to play without drawing fails"""
        game = create_test_game()
        
        current_player_id = game.get_current_player().player_id
        
        game.add_message(PlayDrawnCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)
        
        assert len(events) == 0
        assert len(game.discard_pile) == 0
    
    def test_replace_without_drawing_fails(self):
        """Test attempting to replace without drawing fails"""
        game = create_test_game()
        
        current_player_id = game.get_current_player().player_id
        
        game.add_message(ReplaceAndPlayMessage(
            player_id=current_player_id,
            hand_index=0
        ))
        events = process_messages_and_get_events(game)
        
        assert len(events) == 0
        assert len(game.discard_pile) == 0


class TestSpecialActionPermissions:
    """Test special action permission edge cases"""
    
    def test_special_action_by_wrong_player_ignored(self):
        """Test special action by wrong player is ignored"""
        game = create_test_game(["Alice", "Bob"])
        
        # Set up Alice's special action
        force_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        game.state.special_action_player = game.players[0].player_id
        game.state.special_action_type = "view_own"
        
        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id
        
        # Bob tries to perform Alice's special action
        game.add_message(ViewOwnCardMessage(
            player_id=bob_id,
            card_index=0
        ))
        events = process_messages_and_get_events(game)
        
        # Should still be waiting for Alice's action
        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert game.state.special_action_player == alice_id
        assert len(events) == 0
    
    def test_wrong_special_action_type_ignored(self):
        """Test performing wrong type of special action is ignored"""
        game = create_test_game(["Alice", "Bob"])
        
        # Set up view_own special action
        force_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        game.state.special_action_player = game.players[0].player_id
        game.state.special_action_type = "view_own"
        
        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id
        
        # Alice tries to perform view_opponent action (wrong type)
        game.add_message(ViewOpponentCardMessage(
            player_id=alice_id,
            target_player_id=bob_id,
            card_index=0
        ))
        events = process_messages_and_get_events(game)
        
        # Should still be waiting for correct action
        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert len(events) == 0
    
    def test_special_action_when_not_waiting_ignored(self):
        """Test special action when not in waiting phase is ignored"""
        game = create_test_game()
        
        # Game is in normal playing phase
        assert_game_phase(game, GamePhase.PLAYING)
        
        alice_id = game.players[0].player_id
        
        game.add_message(ViewOwnCardMessage(
            player_id=alice_id,
            card_index=0
        ))
        events = process_messages_and_get_events(game)
        
        # Should remain in playing phase
        assert_game_phase(game, GamePhase.PLAYING)
        assert len(events) == 0


class TestStackPermissions:
    """Test STACK permission edge cases"""
    
    def test_stack_call_without_played_card_fails(self):
        """Test calling STACK without a played card fails"""
        game = create_test_game(["Alice", "Bob"])
        
        assert game.state.played_card is None
        
        bob_id = game.players[1].player_id
        game.add_message(CallStackMessage(player_id=bob_id))
        events = process_messages_and_get_events(game)
        
        assert len(events) == 0
        assert_game_phase(game, GamePhase.PLAYING)
        assert game.state.stack_caller is None
    
    def test_execute_stack_by_wrong_player_fails(self):
        """Test executing STACK by player who didn't call it fails"""
        game = create_test_game(["Alice", "Bob", "Charlie"])
        
        # Bob calls STACK
        played_card = create_specific_card(Rank.KING, Suit.HEARTS)
        set_played_card(game, played_card)
        
        bob_id = game.players[1].player_id
        charlie_id = game.players[2].player_id
        
        game.add_message(CallStackMessage(player_id=bob_id))
        process_messages_and_get_events(game)
        
        assert game.state.stack_caller == bob_id
        
        # Charlie tries to execute (wrong player)
        matching_card = create_specific_card(Rank.KING, Suit.CLUBS)
        deal_specific_cards(game, 2, [matching_card])
        
        game.add_message(ExecuteStackMessage(
            player_id=charlie_id,
            card_index=0,
            target_player_id=None
        ))
        events = process_messages_and_get_events(game)
        
        # Should still be in STACK_CALLED phase
        assert_game_phase(game, GamePhase.STACK_CALLED)
        assert game.state.stack_caller == bob_id
        assert len(events) == 0
    
    def test_execute_stack_when_not_in_stack_phase_fails(self):
        """Test executing STACK when not in STACK_CALLED phase fails"""
        game = create_test_game(["Alice", "Bob"])
        
        # Game is in normal playing phase
        assert_game_phase(game, GamePhase.PLAYING)
        
        bob_id = game.players[1].player_id
        game.add_message(ExecuteStackMessage(
            player_id=bob_id,
            card_index=0,
            target_player_id=None
        ))
        events = process_messages_and_get_events(game)
        
        assert_game_phase(game, GamePhase.PLAYING)
        assert len(events) == 0


class TestBoundaryConditions:
    """Test boundary conditions and limits"""
    
    def test_single_card_hand_operations(self):
        """Test operations when player has only one card"""
        game = create_test_game(["Alice", "Bob"])
        
        # Give Alice only one card
        single_card = [create_specific_card(Rank.ACE, Suit.HEARTS)]
        deal_specific_cards(game, 0, single_card)
        
        assert_player_hand_size(game, 0, 1)
        
        # Alice should still be able to draw and replace
        test_card = create_specific_card(Rank.KING, Suit.CLUBS)
        replace_game_deck(game, [test_card])
        
        set_current_player(game, 0)
        alice_id = game.players[0].player_id
        
        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(ReplaceAndPlayMessage(
            player_id=alice_id,
            hand_index=0
        ))
        events = process_messages_and_get_events(game)
        
        # Should work normally
        assert_player_hand_size(game, 0, 1)  # Still has one card (the new one)
        assert len(game.discard_pile) == 1  # Old card was played
    
    def test_maximum_players_operations(self):
        """Test operations work with maximum reasonable players"""
        player_names = ["Alice", "Bob", "Charlie", "Dave", "Eve", "Frank"]
        game = create_test_game(player_names)
        
        # Should initialize correctly
        assert len(game.players) == 6
        
        # Turn progression should work
        normal_card = create_specific_card(Rank.TWO, Suit.HEARTS)
        replace_game_deck(game, [normal_card] * 6)
        
        # Cycle through all players
        for i in range(6):
            current_player_id = game.get_current_player().player_id
            expected_player_id = game.players[i].player_id
            assert current_player_id == expected_player_id
            
            game.add_message(DrawCardMessage(player_id=current_player_id))
            game.add_message(PlayDrawnCardMessage(player_id=current_player_id))
            process_messages_and_get_events(game)
        
        # Should wrap around to first player
        assert_turn_advances_to(game, 0)
    
    def test_zero_point_hands(self):
        """Test hands that sum to zero points"""
        game = create_test_game(["Alice", "Bob"])
        
        # Give Alice cards that sum to zero
        zero_cards = [
            create_specific_card(Rank.JOKER),               # 0
            create_specific_card(Rank.KING, Suit.HEARTS),   # -1
            create_specific_card(Rank.ACE, Suit.CLUBS)      # +1
        ]
        # Total: 0 + (-1) + 1 = 0
        
        deal_specific_cards(game, 0, zero_cards)
        assert game.players[0].get_score() == 0
        
        # Give Bob positive score
        bob_cards = [create_specific_card(Rank.TWO, Suit.HEARTS)]
        deal_specific_cards(game, 1, bob_cards)
        
        # Alice should win with score of 0
        game.add_message(EndGameMessage())
        process_messages_and_get_events(game)
        
        alice_id = game.players[0].player_id
        assert game.state.winner == alice_id
    
    def test_highly_negative_scores(self):
        """Test hands with very negative scores"""
        game = create_test_game(["Alice", "Bob"])
        
        # Give Alice many red Kings
        negative_cards = [
            create_specific_card(Rank.KING, Suit.HEARTS),    # -1
            create_specific_card(Rank.KING, Suit.DIAMONDS),  # -1
            create_specific_card(Rank.KING, Suit.HEARTS),    # -1
            create_specific_card(Rank.KING, Suit.DIAMONDS)   # -1
        ]
        # Total: -4
        
        deal_specific_cards(game, 0, negative_cards)
        assert game.players[0].get_score() == -4
        
        # Should handle negative scores correctly
        assert game.players[0].get_score() < 0