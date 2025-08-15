"""Tests for special card effects (7/8, 9/10, J/Q, K)"""

import pytest
from services.game_manager import (
    CaboGame, GamePhase, Rank, Suit,
    ViewOwnCardMessage, ViewOpponentCardMessage, SwapCardsMessage,
    KingViewCardMessage, KingSwapCardsMessage, KingSkipSwapMessage,
    SpecialActionTimeoutMessage, TurnTransitionTimeoutMessage,
    DrawCardMessage, PlayDrawnCardMessage
)
from .utils import (
    create_test_game, MockBroadcaster, create_specific_card,
    setup_special_card_scenario, deal_specific_cards, set_current_player,
    force_game_phase, replace_game_deck,
    assert_player_hand_size, assert_player_has_card, assert_card_is_known,
    assert_game_phase, assert_current_player, assert_event_generated,
    process_messages_and_get_events, advance_turn_if_needed, assert_turn_advances_to,
    SPECIAL_CARDS
)


class TestViewOwnCardEffect:
    """Test 7/8 card effect - view own card"""

    def test_seven_triggers_view_own_effect(self):
        """Test playing a 7 triggers view own card effect"""
        game = create_test_game(["Alice", "Bob"])

        seven_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        broadcaster = setup_special_card_scenario(game, 0, seven_card)

        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert game.state.special_action_type == "view_own"
        assert game.state.special_action_player == game.players[0].player_id

    def test_eight_triggers_view_own_effect(self):
        """Test playing an 8 triggers view own card effect"""
        game = create_test_game(["Alice", "Bob"])

        eight_card = create_specific_card(Rank.EIGHT, Suit.CLUBS)
        broadcaster = setup_special_card_scenario(game, 0, eight_card)

        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert game.state.special_action_type == "view_own"

    def test_view_own_card_marks_as_known(self):
        """Test viewing own card marks it as known"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Set up Alice with known hand composition
        alice_cards = [
            create_specific_card(Rank.ACE, Suit.HEARTS),
            create_specific_card(Rank.TWO, Suit.CLUBS),
            create_specific_card(Rank.THREE, Suit.DIAMONDS),
            create_specific_card(Rank.FOUR, Suit.SPADES)
        ]
        deal_specific_cards(game, 0, alice_cards)

        # Alice plays a 7
        seven_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        setup_special_card_scenario(game, 0, seven_card)

        alice_id = game.players[0].player_id

        # Alice views her third card (index 2)
        game.add_message(ViewOwnCardMessage(player_id=alice_id, card_index=2))
        events = process_messages_and_get_events(game)

        # Check card is now known
        assert_card_is_known(game, 0, 2, True)

        # Check turn advanced
        assert_turn_advances_to(game, 1)
        assert_game_phase(game, GamePhase.PLAYING)

    def test_view_own_card_reveals_correct_card(self):
        """Test viewing own card reveals the correct card"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Set up specific card at index 3
        target_card = create_specific_card(Rank.KING, Suit.HEARTS)
        alice_cards = [
            create_specific_card(Rank.ACE, Suit.HEARTS),
            create_specific_card(Rank.TWO, Suit.CLUBS),
            create_specific_card(Rank.THREE, Suit.DIAMONDS),
            target_card
        ]
        deal_specific_cards(game, 0, alice_cards)

        # Set up special effect
        seven_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        setup_special_card_scenario(game, 0, seven_card)

        alice_id = game.players[0].player_id

        # View the target card
        game.add_message(ViewOwnCardMessage(player_id=alice_id, card_index=3))
        events = process_messages_and_get_events(game)

        # The return value would contain the revealed card in a real implementation
        # For now, we verify the card is marked as known
        assert_card_is_known(game, 0, 3, True)
        assert_player_has_card(game, 0, target_card, 3)

    def test_cannot_view_invalid_card_index(self):
        """Test cannot view card at invalid index"""
        game = create_test_game(["Alice", "Bob"])

        seven_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        setup_special_card_scenario(game, 0, seven_card)

        alice_id = game.players[0].player_id

        # Try to view invalid index
        game.add_message(ViewOwnCardMessage(player_id=alice_id, card_index=10))
        events = process_messages_and_get_events(game)

        # Should still be waiting for special action
        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert len(events) == 0


class TestViewOpponentCardEffect:
    """Test 9/10 card effect - view opponent card"""

    def test_nine_triggers_view_opponent_effect(self):
        """Test playing a 9 triggers view opponent card effect"""
        game = create_test_game(["Alice", "Bob"])

        nine_card = create_specific_card(Rank.NINE, Suit.HEARTS)
        broadcaster = setup_special_card_scenario(game, 0, nine_card)

        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert game.state.special_action_type == "view_opponent"

    def test_ten_triggers_view_opponent_effect(self):
        """Test playing a 10 triggers view opponent card effect"""
        game = create_test_game(["Alice", "Bob"])

        ten_card = create_specific_card(Rank.TEN, Suit.DIAMONDS)
        broadcaster = setup_special_card_scenario(game, 0, ten_card)

        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert game.state.special_action_type == "view_opponent"

    def test_view_opponent_card_reveals_card_to_viewer_only(self):
        """Test viewing opponent card reveals it only to the viewer"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Set up Bob with specific cards
        bob_cards = [
            create_specific_card(Rank.QUEEN, Suit.HEARTS),
            create_specific_card(Rank.JACK, Suit.CLUBS),
            create_specific_card(Rank.TEN, Suit.DIAMONDS),
            create_specific_card(Rank.NINE, Suit.SPADES)
        ]
        deal_specific_cards(game, 1, bob_cards)

        # Alice plays a 9
        nine_card = create_specific_card(Rank.NINE, Suit.HEARTS)
        setup_special_card_scenario(game, 0, nine_card)

        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id

        # Alice views Bob's card at index 2
        game.add_message(ViewOpponentCardMessage(
            player_id=alice_id,
            target_player_id=bob_id,
            card_index=2
        ))
        events = process_messages_and_get_events(game)

        # Bob's card should NOT be marked as known to Bob
        assert_card_is_known(game, 1, 2, False)

        # Turn should advance
        assert_turn_advances_to(game, 1)
        assert_game_phase(game, GamePhase.PLAYING)

    def test_cannot_view_own_card_with_opponent_effect(self):
        """Test cannot target yourself with view opponent effect"""
        game = create_test_game(["Alice", "Bob"])

        nine_card = create_specific_card(Rank.NINE, Suit.HEARTS)
        setup_special_card_scenario(game, 0, nine_card)

        alice_id = game.players[0].player_id

        # Alice tries to target herself
        game.add_message(ViewOpponentCardMessage(
            player_id=alice_id,
            target_player_id=alice_id,
            card_index=0
        ))
        events = process_messages_and_get_events(game)

        # Should still be waiting for special action
        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert len(events) == 0

    def test_cannot_view_invalid_target_player(self):
        """Test cannot view card of invalid target player"""
        game = create_test_game(["Alice", "Bob"])

        nine_card = create_specific_card(Rank.NINE, Suit.HEARTS)
        setup_special_card_scenario(game, 0, nine_card)

        alice_id = game.players[0].player_id

        # Alice tries to target invalid player
        game.add_message(ViewOpponentCardMessage(
            player_id=alice_id,
            target_player_id="invalid_player",
            card_index=0
        ))
        events = process_messages_and_get_events(game)

        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert len(events) == 0


class TestSwapCardsEffect:
    """Test J/Q card effect - swap cards with opponent"""

    def test_jack_triggers_swap_effect(self):
        """Test playing a Jack triggers swap effect"""
        game = create_test_game(["Alice", "Bob"])

        jack_card = create_specific_card(Rank.JACK, Suit.HEARTS)
        broadcaster = setup_special_card_scenario(game, 0, jack_card)

        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert game.state.special_action_type == "swap_opponent"

    def test_queen_triggers_swap_effect(self):
        """Test playing a Queen triggers swap effect"""
        game = create_test_game(["Alice", "Bob"])

        queen_card = create_specific_card(Rank.QUEEN, Suit.CLUBS)
        broadcaster = setup_special_card_scenario(game, 0, queen_card)

        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert game.state.special_action_type == "swap_opponent"

    def test_swap_cards_exchanges_correctly(self):
        """Test swapping cards exchanges them correctly"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Set up specific hands
        alice_card = create_specific_card(Rank.ACE, Suit.HEARTS)
        bob_card = create_specific_card(Rank.KING, Suit.SPADES)

        alice_cards = [alice_card, create_specific_card(Rank.TWO, Suit.CLUBS)]
        bob_cards = [bob_card, create_specific_card(Rank.THREE, Suit.DIAMONDS)]

        deal_specific_cards(game, 0, alice_cards)
        deal_specific_cards(game, 1, bob_cards)

        # Alice plays Jack
        jack_card = create_specific_card(Rank.JACK, Suit.HEARTS)
        setup_special_card_scenario(game, 0, jack_card)

        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id

        # Alice swaps her card 0 with Bob's card 0
        game.add_message(SwapCardsMessage(
            player_id=alice_id,
            own_index=0,
            target_player_id=bob_id,
            target_index=0
        ))
        events = process_messages_and_get_events(game)

        # Check cards were swapped
        # Alice now has Bob's card
        assert_player_has_card(game, 0, bob_card, 0)
        # Bob now has Alice's card
        assert_player_has_card(game, 1, alice_card, 0)

        # Check Alice's new card is marked as known
        assert_card_is_known(game, 0, 0, True)

        # Check Bob's new card is not marked as known
        assert_card_is_known(game, 1, 0, False)

        # Turn should advance
        assert_turn_advances_to(game, 1)
        assert_game_phase(game, GamePhase.PLAYING)

    def test_cannot_swap_with_yourself(self):
        """Test cannot swap cards with yourself"""
        game = create_test_game(["Alice", "Bob"])

        jack_card = create_specific_card(Rank.JACK, Suit.HEARTS)
        setup_special_card_scenario(game, 0, jack_card)

        alice_id = game.players[0].player_id

        # Alice tries to swap with herself
        game.add_message(SwapCardsMessage(
            player_id=alice_id,
            own_index=0,
            target_player_id=alice_id,
            target_index=1
        ))
        events = process_messages_and_get_events(game)

        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert len(events) == 0

    def test_cannot_swap_invalid_indices(self):
        """Test cannot swap with invalid card indices"""
        game = create_test_game(["Alice", "Bob"])

        jack_card = create_specific_card(Rank.JACK, Suit.HEARTS)
        setup_special_card_scenario(game, 0, jack_card)

        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id

        # Try invalid own index
        game.add_message(SwapCardsMessage(
            player_id=alice_id,
            own_index=10,
            target_player_id=bob_id,
            target_index=0
        ))
        events = process_messages_and_get_events(game)

        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert len(events) == 0

        # Try invalid target index
        game.add_message(SwapCardsMessage(
            player_id=alice_id,
            own_index=0,
            target_player_id=bob_id,
            target_index=10
        ))
        events = process_messages_and_get_events(game)

        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert len(events) == 0


class TestKingEffect:
    """Test King card effect - view any card and optionally swap"""

    def test_king_triggers_king_view_phase(self):
        """Test playing a King triggers king view phase"""
        game = create_test_game(["Alice", "Bob"])

        king_card = create_specific_card(Rank.KING, Suit.HEARTS)
        broadcaster = setup_special_card_scenario(game, 0, king_card)

        assert_game_phase(game, GamePhase.KING_VIEW_PHASE)
        assert game.state.special_action_player == game.players[0].player_id

    def test_king_view_own_card_transitions_to_swap_phase(self):
        """Test King viewing own card transitions to swap phase"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Set up Alice with specific cards
        alice_cards = [
            create_specific_card(Rank.ACE, Suit.HEARTS),
            create_specific_card(Rank.TWO, Suit.CLUBS),
            create_specific_card(Rank.THREE, Suit.DIAMONDS),
            create_specific_card(Rank.FOUR, Suit.SPADES)
        ]
        deal_specific_cards(game, 0, alice_cards)

        # Alice plays King
        king_card = create_specific_card(Rank.KING, Suit.HEARTS)
        setup_special_card_scenario(game, 0, king_card)

        alice_id = game.players[0].player_id

        # Alice views her own card
        game.add_message(KingViewCardMessage(
            player_id=alice_id,
            target_player_id=alice_id,
            card_index=2
        ))
        process_messages_and_get_events(game)

        # Card should be marked as known
        assert_card_is_known(game, 0, 2, True)

        # Should transition to swap phase
        assert_game_phase(game, GamePhase.KING_SWAP_PHASE)
        assert game.state.king_viewed_player == alice_id
        assert game.state.king_viewed_index == 2

    def test_king_view_opponent_card_transitions_to_swap_phase(self):
        """Test King viewing opponent card transitions to swap phase"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Set up Bob with specific cards
        bob_cards = [
            create_specific_card(Rank.QUEEN, Suit.HEARTS),
            create_specific_card(Rank.JACK, Suit.CLUBS),
            create_specific_card(Rank.TEN, Suit.DIAMONDS),
            create_specific_card(Rank.NINE, Suit.SPADES)
        ]
        deal_specific_cards(game, 1, bob_cards)

        # Alice plays King
        king_card = create_specific_card(Rank.KING, Suit.HEARTS)
        setup_special_card_scenario(game, 0, king_card)

        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id

        # Alice views Bob's card
        game.add_message(KingViewCardMessage(
            player_id=alice_id,
            target_player_id=bob_id,
            card_index=1
        ))
        events = process_messages_and_get_events(game)

        # Should transition to swap phase
        assert_game_phase(game, GamePhase.KING_SWAP_PHASE)
        assert game.state.king_viewed_player == bob_id
        assert game.state.king_viewed_index == 1

        # Opponent's card should not be marked as known to them
        assert_card_is_known(game, 1, 1, False)

    def test_king_swap_after_viewing_own_card(self):
        """Test King can swap after viewing own card"""
        game = create_test_game(["Alice", "Bob"])

        # Set up hands
        alice_card = create_specific_card(Rank.ACE, Suit.HEARTS)
        bob_card = create_specific_card(Rank.QUEEN, Suit.SPADES)

        alice_cards = [alice_card, create_specific_card(Rank.TWO, Suit.CLUBS)]
        bob_cards = [bob_card, create_specific_card(Rank.THREE, Suit.DIAMONDS)]

        deal_specific_cards(game, 0, alice_cards)
        deal_specific_cards(game, 1, bob_cards)

        # Alice plays King and views her card
        king_card = create_specific_card(Rank.KING, Suit.HEARTS)
        setup_special_card_scenario(game, 0, king_card)

        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id

        # View own card
        game.add_message(KingViewCardMessage(
            player_id=alice_id,
            target_player_id=alice_id,
            card_index=0
        ))
        process_messages_and_get_events(game)

        # Now swap with Bob
        game.add_message(KingSwapCardsMessage(
            player_id=alice_id,
            own_index=0,
            target_player_id=bob_id,
            target_index=0
        ))
        events = process_messages_and_get_events(game)

        # Cards should be swapped
        assert_player_has_card(game, 0, bob_card, 0)
        assert_player_has_card(game, 1, alice_card, 0)

        # Alice's new card should be known
        assert_card_is_known(game, 0, 0, True)

        # Should be in turn transition, then advance
        assert_game_phase(game, GamePhase.TURN_TRANSITION)
        assert_turn_advances_to(game, 1)

    def test_king_skip_swap_advances_turn(self):
        """Test King can skip swap and advance turn"""
        game = create_test_game(["Alice", "Bob"])

        # Alice plays King and views a card
        king_card = create_specific_card(Rank.KING, Suit.HEARTS)
        setup_special_card_scenario(game, 0, king_card)

        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id

        # View opponent card
        game.add_message(KingViewCardMessage(
            player_id=alice_id,
            target_player_id=bob_id,
            card_index=0
        ))
        process_messages_and_get_events(game)

        # Skip the swap
        game.add_message(KingSkipSwapMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)

        # Should be in turn transition, then advance
        assert_game_phase(game, GamePhase.TURN_TRANSITION)
        assert_turn_advances_to(game, 1)

        # King state should be cleared
        assert game.state.king_viewed_player is None
        assert game.state.king_viewed_index is None

    def test_cannot_king_view_invalid_card_index(self):
        """Test cannot view card at invalid index during King effect"""
        game = create_test_game(["Alice", "Bob"])

        king_card = create_specific_card(Rank.KING, Suit.HEARTS)
        setup_special_card_scenario(game, 0, king_card)

        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id

        # Try invalid index
        game.add_message(KingViewCardMessage(
            player_id=alice_id,
            target_player_id=bob_id,
            card_index=10
        ))
        events = process_messages_and_get_events(game)

        # Should still be in view phase
        assert_game_phase(game, GamePhase.KING_VIEW_PHASE)
        assert len(events) == 0

    def test_cannot_king_swap_without_viewing_first(self):
        """Test cannot perform King swap without viewing first"""
        game = create_test_game(["Alice", "Bob"])

        king_card = create_specific_card(Rank.KING, Suit.HEARTS)
        setup_special_card_scenario(game, 0, king_card)

        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id

        # Try to swap without viewing first
        game.add_message(KingSwapCardsMessage(
            player_id=alice_id,
            own_index=0,
            target_player_id=bob_id,
            target_index=0
        ))
        events = process_messages_and_get_events(game)

        # Should still be in view phase
        assert_game_phase(game, GamePhase.KING_VIEW_PHASE)
        assert len(events) == 0


class TestSpecialActionTimeout:
    """Test special action timeout mechanics"""

    def test_special_action_timeout_advances_turn(self):
        """Test special action timeout advances turn without effect"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Set up special action scenario
        seven_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        setup_special_card_scenario(game, 0, seven_card)

        # Trigger timeout
        game.add_message(SpecialActionTimeoutMessage())
        events = process_messages_and_get_events(game)

        # Should advance turn and clear special action state
        assert_turn_advances_to(game, 1)
        assert_game_phase(game, GamePhase.PLAYING)
        assert game.state.special_action_player is None
        assert game.state.special_action_type is None

        assert_event_generated(broadcaster, "special_action_timeout")

    def test_special_action_timeout_clears_timer(self):
        """Test special action timeout clears the timer"""
        game = create_test_game(["Alice", "Bob"])

        seven_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        setup_special_card_scenario(game, 0, seven_card)

        timer_id = game.state.special_action_timer_id

        # Trigger timeout
        game.add_message(SpecialActionTimeoutMessage())
        process_messages_and_get_events(game)

        # Timer should be cleared
        assert game.state.special_action_timer_id is None
        assert timer_id not in game.pending_timeouts


class TestSpecialCardIdentification:
    """Test special card identification"""

    def test_non_special_cards_dont_trigger_effects(self):
        """Test non-special cards don't trigger special effects"""
        game = create_test_game(["Alice", "Bob"])

        # Test various non-special cards
        non_special_cards = [
            create_specific_card(Rank.ACE, Suit.HEARTS),
            create_specific_card(Rank.TWO, Suit.CLUBS),
            create_specific_card(Rank.THREE, Suit.DIAMONDS),
            create_specific_card(Rank.FOUR, Suit.SPADES),
            create_specific_card(Rank.FIVE, Suit.HEARTS),
            create_specific_card(Rank.SIX, Suit.CLUBS),
            create_specific_card(Rank.JOKER)
        ]

        for card in non_special_cards:
            # Reset game state
            set_current_player(game, 0)
            force_game_phase(game, GamePhase.PLAYING)
            replace_game_deck(game, [card])

            alice_id = game.players[0].player_id

            # Play the card
            game.add_message(DrawCardMessage(player_id=alice_id))
            game.add_message(PlayDrawnCardMessage(player_id=alice_id))
            events = process_messages_and_get_events(game)

            # Should advance turn normally, no special action
            assert_turn_advances_to(game, 1)
            assert_game_phase(game, GamePhase.PLAYING)
            assert game.state.special_action_player is None

    def test_all_special_cards_trigger_effects(self):
        """Test all special cards trigger appropriate effects"""
        game = create_test_game(["Alice", "Bob"])

        special_card_effects = [
            (Rank.SEVEN, GamePhase.WAITING_FOR_SPECIAL_ACTION, "view_own"),
            (Rank.EIGHT, GamePhase.WAITING_FOR_SPECIAL_ACTION, "view_own"),
            (Rank.NINE, GamePhase.WAITING_FOR_SPECIAL_ACTION, "view_opponent"),
            (Rank.TEN, GamePhase.WAITING_FOR_SPECIAL_ACTION, "view_opponent"),
            (Rank.JACK, GamePhase.WAITING_FOR_SPECIAL_ACTION, "swap_opponent"),
            (Rank.QUEEN, GamePhase.WAITING_FOR_SPECIAL_ACTION, "swap_opponent"),
            (Rank.KING, GamePhase.KING_VIEW_PHASE, None)
        ]

        for rank, expected_phase, expected_effect in special_card_effects:
            # Reset game state
            set_current_player(game, 0)
            force_game_phase(game, GamePhase.PLAYING)
            game.state.special_action_player = None
            game.state.special_action_type = None

            card = create_specific_card(rank, Suit.HEARTS)
            replace_game_deck(game, [card])

            alice_id = game.players[0].player_id

            # Play the card
            game.add_message(DrawCardMessage(player_id=alice_id))
            game.add_message(PlayDrawnCardMessage(player_id=alice_id))
            events = process_messages_and_get_events(game)

            # Should trigger special action
            assert_game_phase(game, expected_phase)
            if expected_effect:
                assert game.state.special_action_type == expected_effect
            assert game.state.special_action_player == alice_id


class TestSpecialActionPermissions:
    """Test permissions for special actions"""

    def test_only_action_player_can_perform_special_action(self):
        """Test only the player who played the special card can perform the action"""
        game = create_test_game(["Alice", "Bob", "Charlie"])

        # Alice plays a 7
        seven_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        setup_special_card_scenario(game, 0, seven_card)

        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id

        # Bob tries to perform Alice's special action
        game.add_message(ViewOwnCardMessage(player_id=bob_id, card_index=0))
        events = process_messages_and_get_events(game)

        # Should still be waiting for Alice's action
        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert game.state.special_action_player == alice_id
        assert len(events) == 0

    def test_wrong_special_action_type_ignored(self):
        """Test performing wrong type of special action is ignored"""
        game = create_test_game(["Alice", "Bob"])

        # Alice plays a 7 (view own effect)
        seven_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        setup_special_card_scenario(game, 0, seven_card)

        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id

        # Alice tries to perform view opponent action (wrong type)
        game.add_message(ViewOpponentCardMessage(
            player_id=alice_id,
            target_player_id=bob_id,
            card_index=0
        ))
        events = process_messages_and_get_events(game)

        # Should still be waiting for correct action
        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert len(events) == 0


class TestTurnTransitionTimeout:
    """Test turn transition timeout mechanics"""

    def test_normal_card_triggers_turn_transition_timeout(self):
        """Test playing normal card triggers turn transition timeout"""
        game = create_test_game(["Alice", "Bob"])

        # Play a normal card
        normal_card = create_specific_card(Rank.FIVE, Suit.HEARTS)
        replace_game_deck(game, [normal_card])

        set_current_player(game, 0)
        alice_id = game.players[0].player_id

        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)

        # Should be in turn transition phase
        assert_game_phase(game, GamePhase.TURN_TRANSITION)
        assert game.state.turn_transition_timer_id is not None

    def test_turn_transition_timeout_advances_turn(self):
        """Test turn transition timeout advances turn"""
        game = create_test_game(["Alice", "Bob"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Play a normal card to trigger turn transition
        normal_card = create_specific_card(Rank.THREE, Suit.CLUBS)
        replace_game_deck(game, [normal_card])

        set_current_player(game, 0)
        alice_id = game.players[0].player_id

        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        process_messages_and_get_events(game)

        # Trigger timeout
        game.add_message(TurnTransitionTimeoutMessage())
        events = process_messages_and_get_events(game)

        # Turn should advance
        assert_turn_advances_to(game, 1)
        assert_game_phase(game, GamePhase.PLAYING)

        # Timer should be cleared
        assert game.state.turn_transition_timer_id is None

        assert_event_generated(broadcaster, "turn_changed", {
            "current_player": game.players[1].player_id
        })

    def test_stack_call_during_turn_transition_cancels_timeout(self):
        """Test STACK call during turn transition cancels timeout"""
        game = create_test_game(["Alice", "Bob"])

        # Alice plays a stackable card
        stackable_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        replace_game_deck(game, [stackable_card])

        set_current_player(game, 0)
        alice_id = game.players[0].player_id
        bob_id = game.players[1].player_id

        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        process_messages_and_get_events(game)

        # Should be in turn transition
        assert_game_phase(game, GamePhase.TURN_TRANSITION)
        timer_id = game.state.turn_transition_timer_id

        # Bob calls STACK
        from services.game_manager import CallStackMessage
        game.add_message(CallStackMessage(player_id=bob_id))
        events = process_messages_and_get_events(game)

        # Should cancel turn transition and enter stack phase
        assert_game_phase(game, GamePhase.STACK_CALLED)
        assert game.state.turn_transition_timer_id is None
        assert timer_id not in game.pending_timeouts
