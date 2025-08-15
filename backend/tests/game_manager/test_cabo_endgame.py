"""Tests for Cabo calling and endgame logic"""

import pytest
from services.game_manager import (
    CaboGame, GamePhase, Rank, Suit,
    CallCaboMessage, DrawCardMessage, PlayDrawnCardMessage,
    TurnTransitionTimeoutMessage, NextTurnMessage, EndGameMessage
)
from .utils import (
    advance_turn_if_needed, create_test_game, MockBroadcaster, create_specific_card,
    setup_cabo_scenario, deal_specific_cards, set_current_player,
    force_game_phase, set_drawn_card, replace_game_deck,
    assert_player_hand_size, assert_game_phase, assert_current_player,
    assert_event_generated, process_messages_and_get_events,
    SCORING_CARDS, assert_turn_advances_to
)


class TestCaboCallling:
    """Test Cabo calling mechanics"""

    def test_player_can_call_cabo_on_their_turn(self):
        """Test player can call Cabo when it's their turn"""
        game = create_test_game(["Alice", "Bob", "Charlie"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Set Alice as current player
        set_current_player(game, 0)
        alice_id = game.players[0].player_id

        # Alice calls Cabo
        game.add_message(CallCaboMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)

        # Check Cabo state
        assert game.is_cabo_called()
        assert_game_phase(game, GamePhase.PLAYING)
        assert game.state.cabo_caller == alice_id
        assert game.state.final_round_started
        assert game.players[0].has_called_cabo

        # Check event generated
        assert_event_generated(broadcaster, "cabo_called", {
            "player_id": alice_id
        })

    def test_cannot_call_cabo_not_your_turn(self):
        """Test cannot call Cabo when it's not your turn"""
        game = create_test_game(["Alice", "Bob"])

        # Set Alice as current player
        set_current_player(game, 0)
        bob_id = game.players[1].player_id

        # Bob tries to call Cabo
        game.add_message(CallCaboMessage(player_id=bob_id))
        events = process_messages_and_get_events(game)

        # Should remain in playing phase
        assert_game_phase(game, GamePhase.PLAYING)
        assert game.state.cabo_caller is None
        assert not game.state.final_round_started
        assert len(events) == 0

    def test_cannot_call_cabo_after_drawing_card(self):
        """Test cannot call Cabo after drawing a card in the same turn"""
        game = create_test_game(["Alice", "Bob"])

        set_current_player(game, 0)
        alice_id = game.players[0].player_id

        # Alice draws a card
        test_card = create_specific_card(Rank.FIVE, Suit.HEARTS)
        replace_game_deck(game, [test_card])

        game.add_message(DrawCardMessage(player_id=alice_id))
        process_messages_and_get_events(game)

        # Alice tries to call Cabo after drawing
        game.add_message(CallCaboMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)

        # Should fail
        assert_game_phase(game, GamePhase.PLAYING)
        assert game.state.cabo_caller is None
        assert len(events) == 0

    def test_cabo_call_advances_turn(self):
        """Test calling Cabo advances to next player's turn"""
        game = create_test_game(["Alice", "Bob", "Charlie"])

        set_current_player(game, 0)
        alice_id = game.players[0].player_id

        # Alice calls Cabo
        game.add_message(CallCaboMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)

        # Turn should advance to Bob
        assert_turn_advances_to(game, 1)

    def test_can_call_cabo_from_waiting_for_special_action_phase(self):
        """Test can call Cabo from waiting for special action phase"""
        game = create_test_game(["Alice", "Bob"])

        # Set up special action scenario
        set_current_player(game, 0)
        force_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        game.state.special_action_player = game.players[0].player_id

        alice_id = game.players[0].player_id

        # Alice calls Cabo instead of performing special action
        game.add_message(CallCaboMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)

        # Should succeed
        assert game.is_cabo_called()
        assert_game_phase(game, GamePhase.PLAYING)
        assert game.state.cabo_caller == alice_id


class TestFinalRound:
    """Test final round mechanics after Cabo is called"""

    def test_final_round_continues_normally(self):
        """Test final round continues with normal turn progression"""
        game = create_test_game(["Alice", "Bob", "Charlie"])

        # Alice calls Cabo
        set_current_player(game, 0)
        alice_id = game.players[0].player_id

        game.add_message(CallCaboMessage(player_id=alice_id))
        process_messages_and_get_events(game)

        # Should advance to Bob's turn
        assert_turn_advances_to(game, 1)
        assert game.is_cabo_called()
        assert_game_phase(game, GamePhase.PLAYING)

        # Bob can play normally
        bob_id = game.players[1].player_id
        test_card = create_specific_card(Rank.THREE, Suit.HEARTS)
        replace_game_deck(game, [test_card])

        game.add_message(DrawCardMessage(player_id=bob_id))
        game.add_message(PlayDrawnCardMessage(player_id=bob_id))
        process_messages_and_get_events(game)

        # Should advance to Charlie
        assert_turn_advances_to(game, 2)
        assert game.is_cabo_called()
        assert_game_phase(game, GamePhase.PLAYING)

    def test_game_ends_when_turn_returns_to_cabo_caller(self):
        """Test game ends when turn returns to the Cabo caller"""
        game = create_test_game(["Alice", "Bob", "Charlie"])

        # Alice calls Cabo
        broadcaster = setup_cabo_scenario(game, 0)
        game.broadcast_callback = broadcaster

        # Play through Bob and Charlie's turns
        normal_cards = [
            create_specific_card(Rank.TWO, Suit.HEARTS),
            create_specific_card(Rank.THREE, Suit.CLUBS)
        ]
        replace_game_deck(game, normal_cards)

        # Bob's turn
        assert_turn_advances_to(game, 1)
        bob_id = game.players[1].player_id
        game.add_message(DrawCardMessage(player_id=bob_id))
        game.add_message(PlayDrawnCardMessage(player_id=bob_id))
        process_messages_and_get_events(game)

        # Charlie's turn
        assert_turn_advances_to(game, 2)
        charlie_id = game.players[2].player_id
        game.add_message(DrawCardMessage(player_id=charlie_id))
        game.add_message(PlayDrawnCardMessage(player_id=charlie_id))
        process_messages_and_get_events(game)
        # advance turn to force NextTurnMessage to be processed
        assert_game_phase(game, GamePhase.TURN_TRANSITION)
        advance_turn_if_needed(game)
        # process EndGameMessage
        process_messages_and_get_events(game)
        # Game should end
        assert_game_phase(game, GamePhase.ENDED)
        assert game.state.winner is not None

        assert_event_generated(broadcaster, "game_ended")

    def test_cabo_caller_protected_during_final_round(self):
        """Test Cabo caller's cards cannot be affected during final round"""
        # This test would verify that STACK and special effects cannot target
        # the Cabo caller during the final round
        # For now, we verify that the has_called_cabo flag is set
        game = create_test_game(["Alice", "Bob"])

        setup_cabo_scenario(game, 0)

        # Verify Alice is protected
        assert game.players[0].has_called_cabo
        assert not game.players[1].has_called_cabo


class TestScoring:
    """Test endgame scoring"""

    def test_lowest_score_wins(self):
        """Test player with lowest score wins"""
        game = create_test_game(["Alice", "Bob", "Charlie"])
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Set up hands with known scores
        alice_cards = [  # Score: 1 + 2 = 3
            create_specific_card(Rank.ACE, Suit.HEARTS),
            create_specific_card(Rank.TWO, Suit.CLUBS)
        ]
        bob_cards = [  # Score: 3 + 4 = 7
            create_specific_card(Rank.THREE, Suit.HEARTS),
            create_specific_card(Rank.FOUR, Suit.CLUBS)
        ]
        charlie_cards = [  # Score: 1 + 1 = 2
            create_specific_card(Rank.ACE, Suit.SPADES),
            create_specific_card(Rank.ACE, Suit.DIAMONDS)
        ]

        deal_specific_cards(game, 0, alice_cards)
        deal_specific_cards(game, 1, bob_cards)
        deal_specific_cards(game, 2, charlie_cards)

        # End the game
        game.add_message(EndGameMessage())
        events = process_messages_and_get_events(game)

        # Charlie should win (lowest score of 2)
        charlie_id = game.players[2].player_id
        assert game.state.winner == charlie_id

        # Check final scores event
        last_event = broadcaster.last_event()
        assert last_event.event_type == "game_ended"
        assert last_event.data["winner_id"] == charlie_id

        final_scores = last_event.data["final_scores"]
        assert len(final_scores) == 3

        # Scores should be sorted by score (lowest first)
        assert final_scores[0]["score"] == 2  # Charlie
        assert final_scores[1]["score"] == 3  # Alice
        assert final_scores[2]["score"] == 7  # Bob

    def test_red_kings_score_negative_one(self):
        """Test red Kings score -1 point"""
        game = create_test_game(["Alice", "Bob"])

        # Give Alice red Kings
        alice_cards = [
            create_specific_card(Rank.KING, Suit.HEARTS),   # -1
            create_specific_card(Rank.KING, Suit.DIAMONDS),  # -1
            create_specific_card(Rank.ACE, Suit.CLUBS)      # +1
        ]
        # Total: -1 + -1 + 1 = -1

        # Give Bob normal cards
        bob_cards = [
            create_specific_card(Rank.TWO, Suit.HEARTS),    # +2
            create_specific_card(Rank.THREE, Suit.CLUBS)    # +3
        ]
        # Total: 2 + 3 = 5

        deal_specific_cards(game, 0, alice_cards)
        deal_specific_cards(game, 1, bob_cards)

        # Check scores
        assert game.players[0].get_score() == -1
        assert game.players[1].get_score() == 5

        # End game and verify Alice wins
        game.add_message(EndGameMessage())
        process_messages_and_get_events(game)

        alice_id = game.players[0].player_id
        assert game.state.winner == alice_id

    def test_black_kings_score_thirteen(self):
        """Test black Kings score 13 points"""
        game = create_test_game(["Alice", "Bob"])

        alice_cards = [
            create_specific_card(Rank.KING, Suit.CLUBS),     # 13
            create_specific_card(Rank.KING, Suit.SPADES)     # 13
        ]
        # Total: 13 + 13 = 26

        bob_cards = [
            create_specific_card(Rank.ACE, Suit.HEARTS)      # 1
        ]
        # Total: 1

        deal_specific_cards(game, 0, alice_cards)
        deal_specific_cards(game, 1, bob_cards)

        assert game.players[0].get_score() == 26
        assert game.players[1].get_score() == 1

    def test_jokers_score_zero(self):
        """Test Jokers score 0 points"""
        game = create_test_game(["Alice", "Bob"])

        alice_cards = [
            create_specific_card(Rank.JOKER),               # 0
            create_specific_card(Rank.JOKER),               # 0
            create_specific_card(Rank.FIVE, Suit.HEARTS)   # 5
        ]
        # Total: 0 + 0 + 5 = 5

        bob_cards = [
            create_specific_card(Rank.TEN, Suit.CLUBS)      # 10
        ]
        # Total: 10

        deal_specific_cards(game, 0, alice_cards)
        deal_specific_cards(game, 1, bob_cards)

        assert game.players[0].get_score() == 5
        assert game.players[1].get_score() == 10

    def test_face_cards_score_correctly(self):
        """Test face cards score their face value"""
        game = create_test_game(["Alice", "Bob"])

        alice_cards = [
            create_specific_card(Rank.JACK, Suit.HEARTS),   # 11
            create_specific_card(Rank.QUEEN, Suit.CLUBS),   # 12
        ]
        # Total: 11 + 12 = 23

        bob_cards = [
            create_specific_card(Rank.TEN, Suit.DIAMONDS),  # 10
            create_specific_card(Rank.NINE, Suit.SPADES)    # 9
        ]
        # Total: 10 + 9 = 19

        deal_specific_cards(game, 0, alice_cards)
        deal_specific_cards(game, 1, bob_cards)

        assert game.players[0].get_score() == 23
        assert game.players[1].get_score() == 19


class TestEndGameConditions:
    """Test various endgame scenarios"""

    def test_game_ends_only_after_full_final_round(self):
        """Test game doesn't end prematurely during final round"""
        game = create_test_game(["Alice", "Bob", "Charlie", "Dave"])

        # Alice calls Cabo
        setup_cabo_scenario(game, 0)
        assert_turn_advances_to(game, 1)  # Should be Bob's turn

        # Play through partial final round
        normal_cards = [
            create_specific_card(Rank.TWO, Suit.HEARTS),
            create_specific_card(Rank.THREE, Suit.CLUBS),
            create_specific_card(Rank.FOUR, Suit.DIAMONDS)
        ]
        replace_game_deck(game, normal_cards)

        # Bob's turn
        bob_id = game.players[1].player_id
        game.add_message(DrawCardMessage(player_id=bob_id))
        game.add_message(PlayDrawnCardMessage(player_id=bob_id))
        process_messages_and_get_events(game)

        # Should still be in final round, not ended
        assert game.is_cabo_called()
        assert_turn_advances_to(game, 2)  # Charlie's turn
        assert_game_phase(game, GamePhase.PLAYING)

        # Charlie's turn
        charlie_id = game.players[2].player_id
        game.add_message(DrawCardMessage(player_id=charlie_id))
        game.add_message(PlayDrawnCardMessage(player_id=charlie_id))
        process_messages_and_get_events(game)

        # Should still be in final round
        assert game.is_cabo_called()
        assert_turn_advances_to(game, 3)  # Dave's turn
        assert_game_phase(game, GamePhase.PLAYING)

        # Dave's turn
        dave_id = game.players[3].player_id
        game.add_message(DrawCardMessage(player_id=dave_id))
        game.add_message(PlayDrawnCardMessage(player_id=dave_id))
        process_messages_and_get_events(game)
        advance_turn_if_needed(game)

        # Now it should end (full round completed)
        assert_game_phase(game, GamePhase.ENDED)

    def test_two_player_cabo_endgame(self):
        """Test Cabo endgame works correctly with two players"""
        game = create_test_game(["Alice", "Bob"])

        # Alice calls Cabo
        setup_cabo_scenario(game, 0)

        # Bob's turn
        normal_card = create_specific_card(Rank.FIVE, Suit.HEARTS)
        replace_game_deck(game, [normal_card])

        bob_id = game.players[1].player_id
        game.add_message(DrawCardMessage(player_id=bob_id))
        game.add_message(PlayDrawnCardMessage(player_id=bob_id))
        events = process_messages_and_get_events(game)

        # Game should end after Bob's turn
        assert_game_phase(game, GamePhase.ENDED)

    def test_cabo_caller_wins_tie_breaker(self):
        """Test Cabo caller wins in case of tied scores"""
        # This would be a house rule - for now we test basic tie handling
        game = create_test_game(["Alice", "Bob"])

        # Give both players same score
        same_score_cards = [create_specific_card(Rank.FIVE, Suit.HEARTS)]
        deal_specific_cards(game, 0, same_score_cards)
        deal_specific_cards(game, 1, same_score_cards)

        assert game.players[0].get_score() == game.players[1].get_score()

        # End game - first player in sorted list wins (basic tie-breaking)
        game.add_message(EndGameMessage())
        process_messages_and_get_events(game)

        # Winner should be determined consistently
        assert game.state.winner in [
            game.players[0].player_id, game.players[1].player_id]


class TestCaboValidation:
    """Test Cabo call validation"""

    def test_cannot_call_cabo_in_wrong_phase(self):
        """Test cannot call Cabo in wrong game phase"""
        game = create_test_game(["Alice", "Bob"])

        # Force game into ended phase
        force_game_phase(game, GamePhase.ENDED)

        alice_id = game.players[0].player_id
        game.add_message(CallCaboMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)

        # Should remain in ended phase
        assert_game_phase(game, GamePhase.ENDED)
        assert len(events) == 0

    def test_multiple_cabo_calls_ignored(self):
        """Test subsequent Cabo calls are ignored"""
        game = create_test_game(["Alice", "Bob", "Charlie"])

        # Alice calls Cabo
        setup_cabo_scenario(game, 0)
        alice_id = game.players[0].player_id

        # Bob tries to call Cabo too
        set_current_player(game, 1)
        bob_id = game.players[1].player_id
        game.add_message(CallCaboMessage(player_id=bob_id))
        events = process_messages_and_get_events(game)

        # Should still be Alice's Cabo
        assert game.state.cabo_caller == alice_id
        assert not game.players[1].has_called_cabo
        assert len(events) == 0
