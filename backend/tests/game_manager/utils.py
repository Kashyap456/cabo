"""Test utilities for game manager tests"""

from typing import List, Optional, Dict, Any, Callable, Tuple
from services.game_manager import (
    CaboGame, Card, Rank, Suit, GamePhase, GameEvent,
    DrawCardMessage, PlayDrawnCardMessage, ReplaceAndPlayMessage,
    CallStackMessage, ExecuteStackMessage, CallCaboMessage,
    ViewOwnCardMessage, ViewOpponentCardMessage, SwapCardsMessage,
    StackTimeoutMessage, SpecialActionTimeoutMessage, SetupTimeoutMessage, NextTurnMessage
)


class MockBroadcaster:
    """Mock broadcast callback for testing"""

    def __init__(self):
        self.events: List[GameEvent] = []

    def __call__(self, event: GameEvent):
        self.events.append(event)

    def clear(self):
        self.events.clear()

    def get_events_of_type(self, event_type: str) -> List[GameEvent]:
        return [event for event in self.events if event.event_type == event_type]

    def last_event(self) -> Optional[GameEvent]:
        return self.events[-1] if self.events else None


def create_test_game(player_names: Optional[List[str]] = None,
                     broadcast_callback: Optional[Callable] = None,
                     advance_setup: bool = True) -> CaboGame:
    """Create a game with test players"""
    if player_names is None:
        player_names = ["Alice", "Bob", "Charlie"]

    player_ids = [f"player_{i}" for i in range(len(player_names))]

    if broadcast_callback is None:
        broadcast_callback = MockBroadcaster()

    game = CaboGame(player_ids, player_names, broadcast_callback)
    if advance_setup:
        advance_setup_if_needed(game)
    return game


def create_specific_card(rank: Rank, suit: Optional[Suit] = None) -> Card:
    """Create a card with specific rank and suit"""
    if rank == Rank.JOKER:
        return Card(rank)
    elif suit is None:
        suit = Suit.HEARTS  # Default suit
    return Card(rank, suit)


def deal_specific_cards(game: CaboGame, player_index: int, cards: List[Card]):
    """Replace a player's hand with specific cards"""
    player = game.players[player_index]
    player.hand = cards.copy()


def set_player_temporarily_viewed_cards(game: CaboGame, viewer_index: int, viewed_cards: List[Tuple[int, int]]):
    """Set temporarily viewed cards for a player"""
    viewer_id = game.players[viewer_index].player_id
    game.state.temporarily_viewed_cards[viewer_id].clear()
    for target_index, card_index in viewed_cards:
        target_id = game.players[target_index].player_id
        game.state.temporarily_viewed_cards[viewer_id].add(
            (target_id, card_index))


def force_game_phase(game: CaboGame, phase: GamePhase):
    """Force the game into a specific phase"""
    game.state.phase = phase


def set_current_player(game: CaboGame, player_index: int):
    """Set the current player"""
    game.state.current_player_index = player_index


def set_drawn_card(game: CaboGame, card: Card):
    """Set the drawn card for current player"""
    game.state.drawn_card = card


def set_played_card(game: CaboGame, card: Card):
    """Set the played card"""
    game.state.played_card = card
    game.discard_pile.append(card)


def create_deck_with_specific_top_cards(top_cards: List[Card]) -> List[Card]:
    """Create a deck with specific cards on top (last in list is drawn first)"""
    # Create a basic deck
    deck_cards = []
    for suit in Suit:
        for rank in Rank:
            if rank != Rank.JOKER:
                deck_cards.append(Card(rank, suit))

    # Add jokers
    deck_cards.extend([Card(Rank.JOKER), Card(Rank.JOKER)])

    # Remove the top cards from deck and add them to the end (so they're drawn first)
    for card in top_cards:
        # Find and remove the card from deck
        for i, deck_card in enumerate(deck_cards):
            if (deck_card.rank == card.rank and
                    deck_card.suit == card.suit):
                deck_cards.pop(i)
                break

    # Add the specific cards to the end (they'll be drawn first)
    deck_cards.extend(reversed(top_cards))

    return deck_cards


def replace_game_deck(game: CaboGame, cards: List[Card]):
    """Replace the game's deck with specific cards"""
    game.deck.cards = cards.copy()


def assert_player_hand_size(game: CaboGame, player_index: int, expected_size: int):
    """Assert a player has the expected hand size"""
    actual_size = len(game.players[player_index].hand)
    assert actual_size == expected_size, f"Player {player_index} hand size {actual_size}, expected {expected_size}"


def assert_player_has_card(game: CaboGame, player_index: int, card: Card, hand_index: Optional[int] = None):
    """Assert a player has a specific card, optionally at a specific index"""
    player = game.players[player_index]
    if hand_index is not None:
        actual_card = player.hand[hand_index]
        assert actual_card.rank == card.rank and actual_card.suit == card.suit, \
            f"Player {player_index} card at index {hand_index} is {actual_card}, expected {card}"
    else:
        card_found = any(
            c.rank == card.rank and c.suit == card.suit
            for c in player.hand
        )
        assert card_found, f"Player {player_index} does not have card {card}"


def assert_card_is_temporarily_viewed(game: CaboGame, viewer_index: int, target_index: int, card_index: int, expected_viewed: bool = True):
    """Assert whether a player can currently view a specific card"""
    viewer_id = game.players[viewer_index].player_id
    target_id = game.players[target_index].player_id
    viewed_cards = game.state.temporarily_viewed_cards.get(viewer_id, set())
    actual_viewed = (target_id, card_index) in viewed_cards
    assert actual_viewed == expected_viewed, \
        f"Player {viewer_index} viewing {target_index}:{card_index} = {actual_viewed}, expected {expected_viewed}"


def assert_game_phase(game: CaboGame, expected_phase: GamePhase):
    """Assert the game is in the expected phase"""
    assert game.state.phase == expected_phase, \
        f"Game phase is {game.state.phase}, expected {expected_phase}"


def assert_current_player(game: CaboGame, expected_player_index: int):
    """Assert the current player is as expected"""
    assert game.state.current_player_index == expected_player_index, \
        f"Current player is {game.state.current_player_index}, expected {expected_player_index}"


def advance_turn_if_needed(game: CaboGame):
    """Advance turn if the game is in a turn transition state"""
    from services.game_manager import GamePhase, TurnTransitionTimeoutMessage

    if game.state.phase == GamePhase.TURN_TRANSITION:
        # Trigger the timeout to advance the turn
        game.add_message(TurnTransitionTimeoutMessage())
        process_messages_and_get_events(game)


def advance_setup_if_needed(game: CaboGame):
    """Advance from setup phase to playing phase"""
    from services.game_manager import GamePhase

    if game.state.phase == GamePhase.SETUP:
        # Trigger the setup timeout to start the game
        game.add_message(SetupTimeoutMessage())
        process_messages_and_get_events(game)


def complete_turn(game: CaboGame, player_id: str, card_actions=None):
    """
    Complete a full turn for a player, handling any turn transition logic.

    Args:
        game: The game instance
        player_id: The player taking the turn
        card_actions: List of card actions to perform (e.g., [DrawCardMessage, PlayDrawnCardMessage])

    Returns:
        List of events generated during the turn
    """
    from services.game_manager import DrawCardMessage, PlayDrawnCardMessage

    all_events = []

    # If no specific actions provided, do a standard draw-and-play turn
    if card_actions is None:
        card_actions = [
            DrawCardMessage(player_id=player_id),
            PlayDrawnCardMessage(player_id=player_id)
        ]

    # Execute the actions
    for action in card_actions:
        game.add_message(action)
        events = process_messages_and_get_events(game)
        all_events.extend(events)

    # Handle any turn transition
    advance_turn_if_needed(game)

    return all_events


def assert_turn_advances_to(game: CaboGame, expected_player_index: int):
    """
    Assert that after handling any turn transition logic, 
    the turn advances to the expected player.
    """
    advance_turn_if_needed(game)
    assert_current_player(game, expected_player_index)


def assert_discard_top(game: CaboGame, expected_card: Card):
    """Assert the top of discard pile is the expected card"""
    assert game.discard_pile, "Discard pile is empty"
    top_card = game.discard_pile[-1]
    assert top_card.rank == expected_card.rank and top_card.suit == expected_card.suit, \
        f"Discard top is {top_card}, expected {expected_card}"


def assert_event_generated(broadcaster: MockBroadcaster, event_type: str,
                           expected_data: Optional[Dict[str, Any]] = None):
    """Assert that a specific event was generated"""
    events = broadcaster.get_events_of_type(event_type)
    assert events, f"No events of type '{event_type}' were generated"

    if expected_data:
        last_event = events[-1]
        for key, expected_value in expected_data.items():
            assert key in last_event.data, f"Event data missing key '{key}'"
            actual_value = last_event.data[key]
            assert actual_value == expected_value, \
                f"Event data['{key}'] is {actual_value}, expected {expected_value}"


def process_messages_and_get_events(game: CaboGame) -> List[GameEvent]:
    """Process all pending messages and return generated events"""
    return game.process_messages()


def setup_stack_scenario(game: CaboGame, stack_caller_index: int,
                         played_card: Card, stack_card: Card,
                         stack_card_hand_index: int = 0) -> MockBroadcaster:
    """Set up a scenario where a player is about to execute a stack"""
    broadcaster = MockBroadcaster()
    game.broadcast_callback = broadcaster

    # Set up the played card
    set_played_card(game, played_card)
    force_game_phase(game, GamePhase.PLAYING)

    # Give the stack caller the stack card
    deal_specific_cards(game, stack_caller_index, [stack_card])

    # Call stack (Phase 1)
    stack_caller_id = game.players[stack_caller_index].player_id
    game.add_message(CallStackMessage(player_id=stack_caller_id))
    game.process_messages()

    broadcaster.clear()  # Clear setup events
    return broadcaster


def setup_special_card_scenario(game: CaboGame, player_index: int,
                                special_card: Card) -> MockBroadcaster:
    """Set up a scenario where a player just played a special card"""
    broadcaster = MockBroadcaster()
    game.broadcast_callback = broadcaster

    # Set current player and give them the special card as drawn
    set_current_player(game, player_index)
    set_drawn_card(game, special_card)
    force_game_phase(game, GamePhase.PLAYING)

    # Play the special card
    player_id = game.players[player_index].player_id
    game.add_message(PlayDrawnCardMessage(player_id=player_id))
    game.process_messages()

    broadcaster.clear()  # Clear setup events
    return broadcaster


def setup_cabo_scenario(game: CaboGame, cabo_caller_index: int) -> MockBroadcaster:
    """Set up a scenario where Cabo has been called"""
    broadcaster = MockBroadcaster()
    game.broadcast_callback = broadcaster

    # Set current player and call Cabo
    set_current_player(game, cabo_caller_index)
    force_game_phase(game, GamePhase.PLAYING)

    player_id = game.players[cabo_caller_index].player_id
    game.add_message(CallCaboMessage(player_id=player_id))
    game.process_messages()

    broadcaster.clear()  # Clear setup events
    return broadcaster


# Common card combinations for testing
MATCHING_PAIR = [
    create_specific_card(Rank.SEVEN, Suit.HEARTS),
    create_specific_card(Rank.SEVEN, Suit.CLUBS)
]

NON_MATCHING_PAIR = [
    create_specific_card(Rank.SEVEN, Suit.HEARTS),
    create_specific_card(Rank.EIGHT, Suit.CLUBS)
]

SPECIAL_CARDS = {
    "view_own": create_specific_card(Rank.SEVEN, Suit.HEARTS),
    "view_opponent": create_specific_card(Rank.NINE, Suit.HEARTS),
    "swap": create_specific_card(Rank.JACK, Suit.HEARTS),
    "king": create_specific_card(Rank.KING, Suit.HEARTS)
}

SCORING_CARDS = [
    create_specific_card(Rank.ACE, Suit.HEARTS),      # 1 point
    create_specific_card(Rank.KING, Suit.HEARTS),     # -1 point (red king)
    create_specific_card(Rank.KING, Suit.CLUBS),      # 13 points (black king)
    create_specific_card(Rank.JOKER)                  # 0 points
]
