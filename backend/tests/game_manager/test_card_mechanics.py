"""Tests for card drawing and playing mechanics"""

import pytest
from services.game_manager import (
    CaboGame, GamePhase, Rank, Suit,
    DrawCardMessage, PlayDrawnCardMessage, ReplaceAndPlayMessage,
    NextTurnMessage
)
from .utils import (
    advance_turn_if_needed, create_test_game, MockBroadcaster, create_specific_card,
    set_current_player, replace_game_deck, create_deck_with_specific_top_cards,
    assert_player_hand_size, assert_player_has_card, assert_card_is_known,
    assert_game_phase, assert_current_player, assert_discard_top,
    assert_event_generated, process_messages_and_get_events, assert_turn_advances_to
)


class TestCardDrawing:
    """Test card drawing mechanics"""

    def test_player_can_draw_card_on_their_turn(self):
        """Test player can draw a card when it's their turn"""
        game = create_test_game()
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        current_player_id = game.get_current_player().player_id

        # Draw a card
        game.add_message(DrawCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)

        assert game.state.drawn_card is not None
        assert_event_generated(broadcaster, "card_drawn", {
                               "player_id": current_player_id})

    def test_player_cannot_draw_card_not_their_turn(self):
        """Test player cannot draw a card when it's not their turn"""
        game = create_test_game(["Alice", "Bob"])

        # Set Alice as current player
        set_current_player(game, 0)
        bob_id = game.players[1].player_id

        # Bob tries to draw
        game.add_message(DrawCardMessage(player_id=bob_id))
        events = process_messages_and_get_events(game)

        assert game.state.drawn_card is None
        assert len(events) == 0  # No events generated on failure

    def test_player_cannot_draw_twice_in_turn(self):
        """Test player cannot draw a second card in the same turn"""
        game = create_test_game()
        current_player_id = game.get_current_player().player_id

        # Draw first card
        game.add_message(DrawCardMessage(player_id=current_player_id))
        process_messages_and_get_events(game)

        assert game.state.drawn_card is not None

        # Try to draw second card
        game.add_message(DrawCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)

        # Should still only have one drawn card, no new events
        assert len(events) == 0

    def test_deck_size_decreases_when_card_drawn(self):
        """Test deck size decreases when a card is drawn"""
        game = create_test_game()
        initial_deck_size = game.deck.size()

        current_player_id = game.get_current_player().player_id
        game.add_message(DrawCardMessage(player_id=current_player_id))
        process_messages_and_get_events(game)

        assert game.deck.size() == initial_deck_size - 1

    def test_cannot_draw_from_empty_deck(self):
        """Test cannot draw from empty deck"""
        game = create_test_game()

        # Empty the deck
        game.deck.cards = []

        current_player_id = game.get_current_player().player_id
        game.add_message(DrawCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)

        assert game.state.drawn_card is None
        assert len(events) == 0


class TestPlayingDrawnCard:
    """Test playing the drawn card directly"""

    def test_player_can_play_drawn_card(self):
        """Test player can play the drawn card directly"""
        game = create_test_game()
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Set up a specific card to be drawn
        test_card = create_specific_card(Rank.THREE, Suit.HEARTS)
        replace_game_deck(game, [test_card])

        current_player_id = game.get_current_player().player_id

        # Draw and play the card
        game.add_message(DrawCardMessage(player_id=current_player_id))
        game.add_message(PlayDrawnCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)

        # Check card went to discard pile
        assert_discard_top(game, test_card)
        assert game.state.drawn_card is None
        assert game.state.played_card.rank == test_card.rank

        # Check event was generated
        assert_event_generated(broadcaster, "card_played", {
            "player_id": current_player_id,
            "card": str(test_card)
        })

    def test_cannot_play_without_drawing(self):
        """Test cannot play a card without drawing first"""
        game = create_test_game()
        current_player_id = game.get_current_player().player_id

        # Try to play without drawing
        game.add_message(PlayDrawnCardMessage(player_id=current_player_id))
        events = process_messages_and_get_events(game)

        assert len(events) == 0
        assert len(game.discard_pile) == 0

    def test_playing_non_special_card_advances_turn(self):
        """Test playing a non-special card advances to next turn"""
        game = create_test_game(["Alice", "Bob"])

        # Set up a non-special card
        normal_card = create_specific_card(Rank.THREE, Suit.HEARTS)
        replace_game_deck(game, [normal_card])

        # Set Alice as current player
        set_current_player(game, 0)
        alice_id = game.players[0].player_id

        # Draw and play
        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)

        # Should advance to Bob's turn
        assert_turn_advances_to(game, 1)

    def test_playing_special_card_waits_for_action(self):
        """Test playing a special card waits for special action"""
        game = create_test_game(["Alice", "Bob"])

        # Set up a special card (7)
        special_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        replace_game_deck(game, [special_card])

        set_current_player(game, 0)
        alice_id = game.players[0].player_id

        # Draw and play
        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        events = process_messages_and_get_events(game)

        # Should be waiting for special action, not advance turn
        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert_current_player(game, 0)  # Still Alice's turn


class TestReplaceAndPlay:
    """Test replacing hand card with drawn card and playing the old one"""

    def test_player_can_replace_and_play(self):
        """Test player can replace a hand card and play the old one"""
        game = create_test_game()
        broadcaster = MockBroadcaster()
        game.broadcast_callback = broadcaster

        # Set up specific cards
        drawn_card = create_specific_card(Rank.KING, Suit.HEARTS)
        hand_card = create_specific_card(Rank.ACE, Suit.SPADES)

        current_player_index = game.state.current_player_index
        current_player_id = game.get_current_player().player_id

        # Replace the first card in hand with our test card
        game.players[current_player_index].hand[0] = hand_card

        # Set up deck and draw
        replace_game_deck(game, [drawn_card])
        game.add_message(DrawCardMessage(player_id=current_player_id))
        process_messages_and_get_events(game)

        # Replace and play
        game.add_message(ReplaceAndPlayMessage(
            player_id=current_player_id, hand_index=0))
        events = process_messages_and_get_events(game)

        # Check the hand card was replaced with drawn card
        assert_player_has_card(game, current_player_index, drawn_card, 0)
        assert_card_is_known(game, current_player_index, 0,
                             True)  # New card should be known

        # Check the old card was played
        assert_discard_top(game, hand_card)
        assert game.state.played_card.rank == hand_card.rank

        # Check event was generated
        assert_event_generated(broadcaster, "card_replaced_and_played", {
            "player_id": current_player_id,
            "hand_index": 0
        })

    def test_cannot_replace_invalid_hand_index(self):
        """Test cannot replace card at invalid hand index"""
        game = create_test_game()
        current_player_id = game.get_current_player().player_id

        # Draw a card first
        drawn_card = create_specific_card(Rank.KING, Suit.HEARTS)
        replace_game_deck(game, [drawn_card])
        game.add_message(DrawCardMessage(player_id=current_player_id))
        process_messages_and_get_events(game)

        # Try to replace at invalid index
        game.add_message(ReplaceAndPlayMessage(
            player_id=current_player_id, hand_index=10))
        events = process_messages_and_get_events(game)

        assert len(events) == 0
        assert len(game.discard_pile) == 0

    def test_replace_and_play_with_special_card_waits_for_action(self):
        """Test replacing and playing a special card waits for special action"""
        game = create_test_game()

        # Set up special card in hand
        special_card = create_specific_card(Rank.SEVEN, Suit.HEARTS)
        drawn_card = create_specific_card(Rank.TWO, Suit.CLUBS)

        current_player_index = game.state.current_player_index
        current_player_id = game.get_current_player().player_id

        # Put special card in hand
        game.players[current_player_index].hand[0] = special_card

        # Draw and replace
        replace_game_deck(game, [drawn_card])
        game.add_message(DrawCardMessage(player_id=current_player_id))
        game.add_message(ReplaceAndPlayMessage(
            player_id=current_player_id, hand_index=0))
        events = process_messages_and_get_events(game)

        # Should be waiting for special action
        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert game.state.special_action_player == current_player_id


class TestTurnProgression:
    """Test turn progression mechanics"""

    def test_turn_advances_clockwise(self):
        """Test turns advance clockwise around the table"""
        game = create_test_game(["Alice", "Bob", "Charlie"])

        # Set up non-special cards for easy turn progression
        normal_cards = [
            create_specific_card(Rank.TWO, Suit.HEARTS),
            create_specific_card(Rank.THREE, Suit.HEARTS),
            create_specific_card(Rank.FOUR, Suit.HEARTS)
        ]
        replace_game_deck(game, normal_cards)

        # Start with player 0
        set_current_player(game, 0)

        # Player 0 draws and plays
        game.add_message(DrawCardMessage(player_id=game.players[0].player_id))
        game.add_message(PlayDrawnCardMessage(
            player_id=game.players[0].player_id))
        process_messages_and_get_events(game)

        assert_turn_advances_to(game, 1)  # Should advance to player 1

        # Player 1 draws and plays
        game.add_message(DrawCardMessage(player_id=game.players[1].player_id))
        game.add_message(PlayDrawnCardMessage(
            player_id=game.players[1].player_id))
        process_messages_and_get_events(game)

        assert_turn_advances_to(game, 2)  # Should advance to player 2

        # Player 2 draws and plays
        game.add_message(DrawCardMessage(player_id=game.players[2].player_id))
        game.add_message(PlayDrawnCardMessage(
            player_id=game.players[2].player_id))
        process_messages_and_get_events(game)

        assert_turn_advances_to(game, 0)  # Should wrap around to player 0

    def test_turn_state_clears_on_advance(self):
        """Test turn state is cleared when advancing to next player"""
        game = create_test_game(["Alice", "Bob"])

        # Set up a normal card
        normal_card = create_specific_card(Rank.TWO, Suit.HEARTS)
        replace_game_deck(game, [normal_card])

        set_current_player(game, 0)
        alice_id = game.players[0].player_id

        # Draw and play
        game.add_message(DrawCardMessage(player_id=alice_id))
        game.add_message(PlayDrawnCardMessage(player_id=alice_id))
        process_messages_and_get_events(game)

        # Check turn state is cleared
        assert_turn_advances_to(game, 1)
        assert game.state.drawn_card is None
        assert game.state.played_card is None


class TestGamePhaseTransitions:
    """Test game phase transitions during card play"""

    def test_normal_card_keeps_playing_phase(self):
        """Test playing normal card keeps game in playing phase"""
        game = create_test_game()

        normal_card = create_specific_card(Rank.FIVE, Suit.CLUBS)
        replace_game_deck(game, [normal_card])

        current_player_id = game.get_current_player().player_id

        game.add_message(DrawCardMessage(player_id=current_player_id))
        game.add_message(PlayDrawnCardMessage(player_id=current_player_id))
        process_messages_and_get_events(game)

        assert_game_phase(game, GamePhase.TURN_TRANSITION)
        advance_turn_if_needed(game)
        assert_game_phase(game, GamePhase.PLAYING)

    def test_special_card_changes_to_waiting_phase(self):
        """Test playing special card changes to waiting for special action phase"""
        game = create_test_game()

        special_card = create_specific_card(Rank.EIGHT, Suit.DIAMONDS)
        replace_game_deck(game, [special_card])

        current_player_id = game.get_current_player().player_id

        game.add_message(DrawCardMessage(player_id=current_player_id))
        game.add_message(PlayDrawnCardMessage(player_id=current_player_id))
        process_messages_and_get_events(game)

        assert_game_phase(game, GamePhase.WAITING_FOR_SPECIAL_ACTION)
        assert game.state.special_action_player == current_player_id


class TestDiscardPile:
    """Test discard pile management"""

    def test_played_cards_go_to_discard_pile(self):
        """Test played cards are added to discard pile"""
        game = create_test_game()

        cards = [
            create_specific_card(Rank.ACE, Suit.HEARTS),
            create_specific_card(Rank.TWO, Suit.CLUBS)
        ]
        replace_game_deck(game, cards)

        set_current_player(game, 0)
        current_player_id = game.get_current_player().player_id

        # Play first card
        game.add_message(DrawCardMessage(player_id=current_player_id))
        game.add_message(PlayDrawnCardMessage(player_id=current_player_id))
        process_messages_and_get_events(game)
        assert_turn_advances_to(game, 1)

        assert len(game.discard_pile) == 1
        assert_discard_top(game, cards[1])

        # Advance turn and play second card
        next_player_id = game.get_current_player().player_id
        game.add_message(DrawCardMessage(player_id=next_player_id))
        game.add_message(PlayDrawnCardMessage(player_id=next_player_id))
        process_messages_and_get_events(game)
        assert_turn_advances_to(game, 2)
        assert len(game.discard_pile) == 2
        assert_discard_top(game, cards[0])

    def test_discard_pile_maintains_order(self):
        """Test discard pile maintains chronological order"""
        game = create_test_game()

        first_card = create_specific_card(Rank.FIVE, Suit.SPADES)
        second_card = create_specific_card(Rank.SIX, Suit.HEARTS)
        replace_game_deck(game, [second_card, first_card])

        set_current_player(game, 0)
        current_player_id = game.get_current_player().player_id

        # Play first card
        game.add_message(DrawCardMessage(player_id=current_player_id))
        game.add_message(PlayDrawnCardMessage(player_id=current_player_id))
        process_messages_and_get_events(game)
        assert_turn_advances_to(game, 1)

        # Play second card (next turn)
        next_player_id = game.get_current_player().player_id
        game.add_message(DrawCardMessage(player_id=next_player_id))
        game.add_message(PlayDrawnCardMessage(player_id=next_player_id))
        process_messages_and_get_events(game)
        assert_turn_advances_to(game, 2)

        # Check order in discard pile
        assert game.discard_pile[0].rank == first_card.rank
        assert game.discard_pile[1].rank == second_card.rank
