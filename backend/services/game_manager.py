from enum import Enum
from typing import List, Optional, Dict, Any, Tuple, Callable, Union, Set
from collections import defaultdict
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
import random
import uuid
import time
from queue import Queue, Empty


class Suit(Enum):
    HEARTS = "hearts"
    DIAMONDS = "diamonds"
    CLUBS = "clubs"
    SPADES = "spades"


class Rank(Enum):
    ACE = 1
    TWO = 2
    THREE = 3
    FOUR = 4
    FIVE = 5
    SIX = 6
    SEVEN = 7
    EIGHT = 8
    NINE = 9
    TEN = 10
    JACK = 11
    QUEEN = 12
    KING = 13
    JOKER = 0


@dataclass
class Card:
    rank: Rank
    suit: Optional[Suit] = None  # Jokers don't have suits

    @property
    def value(self) -> int:
        """Card value for scoring"""
        if self.rank == Rank.JOKER:
            return 0
        elif self.rank == Rank.KING and self.suit in [Suit.HEARTS, Suit.DIAMONDS]:
            return -1  # Red Kings
        else:
            return self.rank.value

    @property
    def is_special(self) -> bool:
        """Returns True if card has special effects"""
        return self.rank.value in [7, 8, 9, 10, 11, 12, 13]

    def __str__(self) -> str:
        if self.rank == Rank.JOKER:
            return "Joker"
        
        # Map rank to short format
        rank_map = {
            Rank.ACE: 'A',
            Rank.TWO: '2',
            Rank.THREE: '3',
            Rank.FOUR: '4',
            Rank.FIVE: '5',
            Rank.SIX: '6',
            Rank.SEVEN: '7',
            Rank.EIGHT: '8',
            Rank.NINE: '9',
            Rank.TEN: '10',
            Rank.JACK: 'J',
            Rank.QUEEN: 'Q',
            Rank.KING: 'K'
        }
        
        # Map suit to symbol
        suit_map = {
            Suit.HEARTS: '♥',
            Suit.DIAMONDS: '♦',
            Suit.CLUBS: '♣',
            Suit.SPADES: '♠'
        }
        
        rank_str = rank_map.get(self.rank, str(self.rank.value))
        suit_str = suit_map.get(self.suit, '?')
        
        return f"{rank_str}{suit_str}"


class Deck:
    def __init__(self, include_jokers: bool = True):
        self.cards: List[Card] = []
        self._build_deck(include_jokers)
        self.shuffle()

    def _build_deck(self, include_jokers: bool):
        """Build a standard 52-card deck + jokers"""
        for suit in Suit:
            for rank in Rank:
                if rank != Rank.JOKER:
                    self.cards.append(Card(rank, suit))

        if include_jokers:
            self.cards.extend([Card(Rank.JOKER), Card(Rank.JOKER)])

    def shuffle(self):
        random.shuffle(self.cards)

    def draw(self) -> Optional[Card]:
        return self.cards.pop() if self.cards else None

    def size(self) -> int:
        return len(self.cards)


@dataclass
class Player:
    player_id: str
    name: str
    hand: List[Card] = field(default_factory=list)
    has_called_cabo: bool = False

    def add_card(self, card: Card):
        """Add a card to player's hand"""
        self.hand.append(card)

    def replace_card(self, index: int, new_card: Card) -> Card:
        """Replace a card at given index, return the old card"""
        old_card = self.hand[index]
        self.hand[index] = new_card
        return old_card

    def get_score(self) -> int:
        """Calculate total score of hand"""
        return sum(card.value for card in self.hand)


class GamePhase(Enum):
    SETUP = "setup"
    PLAYING = "playing"
    WAITING_FOR_SPECIAL_ACTION = "waiting_for_special_action"
    KING_VIEW_PHASE = "king_view_phase"
    KING_SWAP_PHASE = "king_swap_phase"
    STACK_CALLED = "stack_called"
    TURN_TRANSITION = "turn_transition"
    ENDED = "ended"


# Message Types
class MessageType(Enum):
    # Player actions
    DRAW_CARD = "draw_card"
    PLAY_DRAWN_CARD = "play_drawn_card"
    REPLACE_AND_PLAY = "replace_and_play"
    CALL_STACK = "call_stack"
    EXECUTE_STACK = "execute_stack"
    CALL_CABO = "call_cabo"
    VIEW_OWN_CARD = "view_own_card"
    VIEW_OPPONENT_CARD = "view_opponent_card"
    SWAP_CARDS = "swap_cards"
    KING_VIEW_CARD = "king_view_card"
    KING_SWAP_CARDS = "king_swap_cards"
    KING_SKIP_SWAP = "king_skip_swap"

    # System events
    STACK_TIMEOUT = "stack_timeout"
    SPECIAL_ACTION_TIMEOUT = "special_action_timeout"
    TURN_TRANSITION_TIMEOUT = "turn_transition_timeout"
    SETUP_TIMEOUT = "setup_timeout"
    NEXT_TURN = "next_turn"
    END_GAME = "end_game"


@dataclass
class GameMessage:
    """Base class for all game messages"""
    type: MessageType
    timestamp: float = field(default_factory=time.time)


@dataclass
class PlayerActionMessage(GameMessage):
    """Messages initiated by player actions"""
    player_id: str = field(default="")


@dataclass
class DrawCardMessage(PlayerActionMessage):
    type: MessageType = MessageType.DRAW_CARD


@dataclass
class PlayDrawnCardMessage(PlayerActionMessage):
    type: MessageType = MessageType.PLAY_DRAWN_CARD


@dataclass
class ReplaceAndPlayMessage(PlayerActionMessage):
    hand_index: int = 0
    type: MessageType = MessageType.REPLACE_AND_PLAY


@dataclass
class CallStackMessage(PlayerActionMessage):
    type: MessageType = MessageType.CALL_STACK


@dataclass
class ExecuteStackMessage(PlayerActionMessage):
    card_index: int = 0
    target_player_id: Optional[str] = None
    type: MessageType = MessageType.EXECUTE_STACK


@dataclass
class CallCaboMessage(PlayerActionMessage):
    type: MessageType = MessageType.CALL_CABO


@dataclass
class ViewOwnCardMessage(PlayerActionMessage):
    card_index: int = 0
    type: MessageType = MessageType.VIEW_OWN_CARD


@dataclass
class ViewOpponentCardMessage(PlayerActionMessage):
    target_player_id: str = ""
    card_index: int = 0
    type: MessageType = MessageType.VIEW_OPPONENT_CARD


@dataclass
class SwapCardsMessage(PlayerActionMessage):
    own_index: int = 0
    target_player_id: str = ""
    target_index: int = 0
    type: MessageType = MessageType.SWAP_CARDS


@dataclass
class KingViewCardMessage(PlayerActionMessage):
    target_player_id: str = ""
    card_index: int = 0
    type: MessageType = MessageType.KING_VIEW_CARD


@dataclass
class KingSwapCardsMessage(PlayerActionMessage):
    own_index: int = 0
    target_player_id: str = ""
    target_index: int = 0
    type: MessageType = MessageType.KING_SWAP_CARDS


@dataclass
class KingSkipSwapMessage(PlayerActionMessage):
    type: MessageType = MessageType.KING_SKIP_SWAP


@dataclass
class SystemMessage(GameMessage):
    """System-generated messages"""
    pass


@dataclass
class StackTimeoutMessage(SystemMessage):
    type: MessageType = MessageType.STACK_TIMEOUT


@dataclass
class SpecialActionTimeoutMessage(SystemMessage):
    type: MessageType = MessageType.SPECIAL_ACTION_TIMEOUT


@dataclass
class TurnTransitionTimeoutMessage(SystemMessage):
    type: MessageType = MessageType.TURN_TRANSITION_TIMEOUT


@dataclass
class SetupTimeoutMessage(SystemMessage):
    type: MessageType = MessageType.SETUP_TIMEOUT


@dataclass
class NextTurnMessage(SystemMessage):
    type: MessageType = MessageType.NEXT_TURN


@dataclass
class EndGameMessage(SystemMessage):
    type: MessageType = MessageType.END_GAME


# Game Events (for broadcasting)
@dataclass
class GameEvent:
    """Events to broadcast to clients"""
    event_type: str
    data: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)


@dataclass
class GameState:
    phase: GamePhase
    current_player_index: int
    drawn_card: Optional[Card] = None
    played_card: Optional[Card] = None
    stack_caller: Optional[str] = None
    stack_timer_id: Optional[str] = None
    special_action_player: Optional[str] = None
    special_action_type: Optional[str] = None
    special_action_timer_id: Optional[str] = None
    king_viewed_card: Optional[Card] = None
    king_viewed_player: Optional[str] = None
    king_viewed_index: Optional[int] = None
    turn_transition_timer_id: Optional[str] = None
    setup_timer_id: Optional[str] = None
    cabo_caller: Optional[str] = None
    final_round_started: bool = False
    winner: Optional[str] = None
    # Track temporarily viewed cards: {viewer_id: {(target_player_id, card_index)}}
    temporarily_viewed_cards: defaultdict = field(
        default_factory=lambda: defaultdict(set))


class CaboGame:
    def __init__(self, player_ids: List[str], player_names: List[str], broadcast_callback: Optional[Callable[[GameEvent], None]] = None, checkpoint_callback: Optional[Callable[[], None]] = None):
        self.game_id = str(uuid.uuid4())
        self.deck = Deck()
        self.discard_pile: List[Card] = []
        self.players: List[Player] = []
        self.state = GameState(GamePhase.SETUP, 0)
        self.message_queue: Queue[GameMessage] = Queue()
        self.broadcast_callback = broadcast_callback
        self.checkpoint_callback = checkpoint_callback
        # timeout_id -> expiry_time
        self.pending_timeouts: Dict[str, float] = {}

        # Initialize players
        for player_id, name in zip(player_ids, player_names):
            self.players.append(Player(player_id, name))

        # Deal initial cards
        self._deal_initial_cards()

        # Set up initial card visibility (first 2 cards visible during setup)
        for player in self.players:
            self.state.temporarily_viewed_cards[player.player_id].add(
                (player.player_id, 0))
            self.state.temporarily_viewed_cards[player.player_id].add(
                (player.player_id, 1))

        # Schedule setup timeout (game stays in SETUP phase)
        self.state.setup_timer_id = self._schedule_timeout(
            SetupTimeoutMessage(), 10.0)  # 10 seconds for setup

        self._broadcast_event(
            "game_started", {
                "phase": "setup",
                "setup_time_seconds": 10
            })

    def _deal_initial_cards(self):
        """Deal 4 cards to each player"""
        for player in self.players:
            for _ in range(4):
                card = self.deck.draw()
                if card:
                    player.add_card(card)

    def is_cabo_called(self) -> bool:
        """Check if Cabo has been called (final round has started)"""
        return self.state.cabo_caller is not None

    def _broadcast_event(self, event_type: str, data: Dict[str, Any]):
        """Broadcast an event to all clients"""
        if self.broadcast_callback:
            event = GameEvent(event_type, data)
            self.broadcast_callback(event)

    def _trigger_checkpoint(self):
        """Trigger a checkpoint creation"""
        if self.checkpoint_callback:
            self.checkpoint_callback()

    def _schedule_timeout(self, message: GameMessage, delay_seconds: float) -> str:
        """Schedule a timeout message to be added to queue after delay"""
        timeout_id = str(uuid.uuid4())
        expiry_time = time.time() + delay_seconds
        self.pending_timeouts[timeout_id] = expiry_time
        # In a real implementation, you'd use asyncio or threading to schedule this
        # For now, we'll check timeouts during process_messages()
        return timeout_id

    def _check_timeouts(self):
        """Check and trigger any expired timeouts"""
        current_time = time.time()
        expired_timeouts = []

        for timeout_id, expiry_time in self.pending_timeouts.items():
            if current_time >= expiry_time:
                expired_timeouts.append(timeout_id)

        for timeout_id in expired_timeouts:
            del self.pending_timeouts[timeout_id]

            # Add appropriate timeout message
            if timeout_id == self.state.stack_timer_id:
                self.message_queue.put(StackTimeoutMessage())
                self.state.stack_timer_id = None
            elif timeout_id == self.state.special_action_timer_id:
                self.message_queue.put(SpecialActionTimeoutMessage())
                self.state.special_action_timer_id = None
            elif timeout_id == self.state.turn_transition_timer_id:
                self.message_queue.put(TurnTransitionTimeoutMessage())
                self.state.turn_transition_timer_id = None
            elif timeout_id == self.state.setup_timer_id:
                self.message_queue.put(SetupTimeoutMessage())
                self.state.setup_timer_id = None

    def add_message(self, message: GameMessage):
        """Add a message to the processing queue"""
        self.message_queue.put(message)

    def process_messages(self) -> List[GameEvent]:
        """Process all pending messages and return events to broadcast"""
        events = []

        # Check for expired timeouts first
        self._check_timeouts()

        # Process all queued messages
        while True:
            try:
                message = self.message_queue.get_nowait()
                result = self._handle_message(message)
                if result.get("success", False):
                    # Add any generated events (support both single event and multiple events)
                    if "event" in result:
                        event = result["event"]
                        events.append(event)
                        # Actually broadcast the event
                        self._broadcast_event(event.event_type, event.data)
                    # Support multiple events from a single handler
                    if "events" in result:
                        for event in result["events"]:
                            events.append(event)
                            # Actually broadcast the event
                            self._broadcast_event(event.event_type, event.data)
                    # Add any follow-up messages
                    if "next_messages" in result:
                        for next_msg in result["next_messages"]:
                            self.message_queue.put(next_msg)
            except Empty:
                break

        return events

    def _handle_message(self, message: GameMessage) -> Dict[str, Any]:
        """Route message to appropriate handler"""
        handlers = {
            MessageType.DRAW_CARD: self._handle_draw_card,
            MessageType.PLAY_DRAWN_CARD: self._handle_play_drawn_card,
            MessageType.REPLACE_AND_PLAY: self._handle_replace_and_play,
            MessageType.CALL_STACK: self._handle_call_stack,
            MessageType.EXECUTE_STACK: self._handle_execute_stack,
            MessageType.CALL_CABO: self._handle_call_cabo,
            MessageType.VIEW_OWN_CARD: self._handle_view_own_card,
            MessageType.VIEW_OPPONENT_CARD: self._handle_view_opponent_card,
            MessageType.SWAP_CARDS: self._handle_swap_cards,
            MessageType.KING_VIEW_CARD: self._handle_king_view_card,
            MessageType.KING_SWAP_CARDS: self._handle_king_swap_cards,
            MessageType.KING_SKIP_SWAP: self._handle_king_skip_swap,
            MessageType.STACK_TIMEOUT: self._handle_stack_timeout,
            MessageType.SPECIAL_ACTION_TIMEOUT: self._handle_special_action_timeout,
            MessageType.TURN_TRANSITION_TIMEOUT: self._handle_turn_transition_timeout,
            MessageType.SETUP_TIMEOUT: self._handle_setup_timeout,
            MessageType.NEXT_TURN: self._handle_next_turn,
            MessageType.END_GAME: self._handle_end_game,
        }

        handler = handlers.get(message.type)
        if handler:
            return handler(message)
        else:
            return {"success": False, "error": f"Unknown message type: {message.type}"}

    def _handle_draw_card(self, message: DrawCardMessage) -> Dict[str, Any]:
        """Handle draw card action"""
        if self.state.phase != GamePhase.PLAYING:
            return {"success": False, "error": "Game not in playing phase"}

        current_player = self.get_current_player()
        if current_player.player_id != message.player_id:
            return {"success": False, "error": "Not your turn"}

        if self.state.drawn_card is not None:
            return {"success": False, "error": "Card already drawn this turn"}

        card = self.deck.draw()
        if not card:
            return {"success": False, "error": "Deck is empty"}

        self.state.drawn_card = card
        return {
            "success": True,
            "event": GameEvent("card_drawn", {
                "player_id": message.player_id,
                "card": str(card)  # Always pass the actual card, orchestrator handles visibility
            })
        }

    def _handle_play_drawn_card(self, message: PlayDrawnCardMessage) -> Dict[str, Any]:
        """Handle playing the drawn card directly"""
        if self.state.drawn_card is None:
            return {"success": False, "error": "No card drawn"}

        current_player = self.get_current_player()
        if current_player.player_id != message.player_id:
            return {"success": False, "error": "Not your turn"}

        card = self.state.drawn_card
        self.state.played_card = card
        self.state.drawn_card = None
        self.discard_pile.append(card)

        # Handle special effects
        events = []
        next_messages = []
        
        # Always send the card_played event first
        events.append(GameEvent("card_played", {
            "player_id": message.player_id,
            "card": str(card),
            "special_effect": card.is_special
        }))
        
        if card.is_special:
            self.state.special_action_player = message.player_id
            self.state.special_action_timer_id = self._schedule_timeout(
                SpecialActionTimeoutMessage(), 30.0)

            if card.rank == Rank.KING:
                # King effect: two-stage process
                self.state.phase = GamePhase.KING_VIEW_PHASE
                events.append(GameEvent("game_phase_changed", {
                    "phase": "king_view_phase",
                    "current_player": self.get_current_player().player_id
                }))
            else:
                self.state.phase = GamePhase.WAITING_FOR_SPECIAL_ACTION
                self.state.special_action_type = self._get_special_action_type(
                    card)
                events.append(GameEvent("game_phase_changed", {
                    "phase": "waiting_for_special_action",
                    "current_player": self.get_current_player().player_id,
                    "special_action_type": self.state.special_action_type
                }))
        else:
            # Start turn transition timer instead of immediate next turn
            self.state.phase = GamePhase.TURN_TRANSITION
            self.state.turn_transition_timer_id = self._schedule_timeout(
                TurnTransitionTimeoutMessage(), 5.0)
            
            events.append(GameEvent("game_phase_changed", {
                "phase": "turn_transition",
                "current_player": self.get_current_player().player_id
            }))

        return {
            "success": True,
            "events": events,
            "next_messages": next_messages
        }

    def _handle_replace_and_play(self, message: ReplaceAndPlayMessage) -> Dict[str, Any]:
        """Handle replacing hand card with drawn card and playing the old one"""
        if self.state.drawn_card is None:
            return {"success": False, "error": "No card drawn"}

        current_player = self.get_current_player()
        if current_player.player_id != message.player_id:
            return {"success": False, "error": "Not your turn"}

        if not (0 <= message.hand_index < len(current_player.hand)):
            return {"success": False, "error": "Invalid hand index"}

        # Replace the card
        old_card = current_player.replace_card(
            message.hand_index, self.state.drawn_card)
        self.state.played_card = old_card
        self.state.drawn_card = None
        self.discard_pile.append(old_card)

        # Handle special effects
        events = []
        next_messages = []
        
        # Always send the card_replaced_and_played event first
        events.append(GameEvent("card_replaced_and_played", {
            "player_id": message.player_id,
            "played_card": str(old_card),
            "hand_index": message.hand_index,
            "special_effect": old_card.is_special
        }))
        
        if old_card.is_special:
            self.state.special_action_player = message.player_id
            self.state.special_action_timer_id = self._schedule_timeout(
                SpecialActionTimeoutMessage(), 30.0)

            if old_card.rank == Rank.KING:
                # King effect: two-stage process
                self.state.phase = GamePhase.KING_VIEW_PHASE
                events.append(GameEvent("game_phase_changed", {
                    "phase": "king_view_phase",
                    "current_player": self.get_current_player().player_id
                }))
            else:
                self.state.phase = GamePhase.WAITING_FOR_SPECIAL_ACTION
                self.state.special_action_type = self._get_special_action_type(
                    old_card)
                events.append(GameEvent("game_phase_changed", {
                    "phase": "waiting_for_special_action",
                    "current_player": self.get_current_player().player_id,
                    "special_action_type": self.state.special_action_type
                }))
        else:
            # Start turn transition timer instead of immediate next turn
            self.state.phase = GamePhase.TURN_TRANSITION
            self.state.turn_transition_timer_id = self._schedule_timeout(
                TurnTransitionTimeoutMessage(), 5.0)
            
            events.append(GameEvent("game_phase_changed", {
                "phase": "turn_transition",
                "current_player": self.get_current_player().player_id
            }))

        return {
            "success": True,
            "events": events,
            "next_messages": next_messages
        }

    def _handle_call_stack(self, message: CallStackMessage) -> Dict[str, Any]:
        """Handle initial stack call (Phase 1)"""
        if self.state.played_card is None:
            return {"success": False, "error": "No card to stack on"}

        if self.state.phase == GamePhase.STACK_CALLED or self.state.stack_caller is not None:
            return {"success": False, "error": "Another player already called STACK"}

        player = self.get_player_by_id(message.player_id)
        if not player:
            return {"success": False, "error": "Player not found"}

        # Check if we're in a special action phase
        if self.state.phase in [GamePhase.WAITING_FOR_SPECIAL_ACTION, GamePhase.KING_VIEW_PHASE, GamePhase.KING_SWAP_PHASE]:
            # During special actions, just set the stack caller but don't change phase
            self.state.stack_caller = message.player_id
            return {
                "success": True,
                "event": GameEvent("stack_called", {
                    "caller": player.name,
                    "caller_id": message.player_id,
                    "target_card": str(self.state.played_card)
                })
            }

        # Normal case: immediately start the stack phase
        self.state.phase = GamePhase.STACK_CALLED
        self.state.stack_caller = message.player_id
        self.state.stack_timer_id = self._schedule_timeout(
            StackTimeoutMessage(), 30.0)
        self.pending_timeouts.pop(
            self.state.turn_transition_timer_id, None)
        self.state.turn_transition_timer_id = None

        return {
            "success": True,
            "event": GameEvent("stack_called", {
                "caller": player.name,
                "caller_id": message.player_id,
                "target_card": str(self.state.played_card)
            })
        }

    def _handle_execute_stack(self, message: ExecuteStackMessage) -> Dict[str, Any]:
        """Handle stack execution (Phase 2)"""
        if self.state.stack_caller != message.player_id:
            return {"success": False, "error": "You did not call STACK"}

        if self.state.phase != GamePhase.STACK_CALLED:
            return {"success": False, "error": "Not in stack phase"}

        player = self.get_player_by_id(message.player_id)
        if not player:
            return {"success": False, "error": "Player not found"}

        if not (0 <= message.card_index < len(player.hand)):
            return {"success": False, "error": "Invalid card index"}

        stack_card = player.hand[message.card_index]
        played_card = self.state.played_card

        # Clear stack state
        self._clear_stack_state()

        next_messages = [NextTurnMessage()]

        # Check if stack is valid (same rank)
        if stack_card.rank == played_card.rank:
            # Successful stack
            if message.target_player_id is None:
                # Self stack - discard the stack card
                player.hand.pop(message.card_index)
                self.discard_pile.append(stack_card)

                return {
                    "success": True,
                    "event": GameEvent("stack_success", {
                        "type": "self_stack",
                        "player": player.name,
                        "discarded_card": str(stack_card)
                    }),
                    "next_messages": next_messages
                }
            else:
                # Opponent stack - give card to opponent
                target_player = self.get_player_by_id(message.target_player_id)
                if not target_player:
                    return {"success": False, "error": "Target player not found"}

                player.hand.pop(message.card_index)
                target_player.add_card(stack_card)

                return {
                    "success": True,
                    "event": GameEvent("stack_success", {
                        "type": "opponent_stack",
                        "player": player.name,
                        "target": target_player.name,
                        "given_card": str(stack_card)
                    }),
                    "next_messages": next_messages
                }
        else:
            # Failed stack - player draws a card
            drawn_card = self.deck.draw()
            if drawn_card:
                player.add_card(drawn_card)

            return {
                "success": True,
                "event": GameEvent("stack_failed", {
                    "player": player.name,
                    "attempted_card": str(stack_card),
                    "penalty": drawn_card is not None
                }),
                "next_messages": next_messages
            }

    def _handle_stack_timeout(self, message: StackTimeoutMessage) -> Dict[str, Any]:
        """Handle stack timeout"""
        if self.state.phase != GamePhase.STACK_CALLED:
            return {"success": False, "error": "Not in stack phase"}

        stack_caller = self.get_player_by_id(self.state.stack_caller)
        if stack_caller:
            # Apply penalty
            drawn_card = self.deck.draw()
            if drawn_card:
                stack_caller.add_card(drawn_card)

        self._clear_stack_state()

        return {
            "success": True,
            "event": GameEvent("stack_timeout", {
                "player": stack_caller.name if stack_caller else "Unknown",
                "penalty": drawn_card is not None if 'drawn_card' in locals() else False
            }),
            "next_messages": [NextTurnMessage()]
        }

    def _handle_call_cabo(self, message: CallCaboMessage) -> Dict[str, Any]:
        """Handle Cabo call"""
        if self.state.phase not in [GamePhase.PLAYING, GamePhase.WAITING_FOR_SPECIAL_ACTION]:
            return {"success": False, "error": "Cannot call Cabo in current phase"}

        current_player = self.get_current_player()
        if current_player.player_id != message.player_id:
            return {"success": False, "error": "Not your turn"}

        if self.state.drawn_card is not None:
            return {"success": False, "error": "Cannot call Cabo after drawing a card"}

        if self.is_cabo_called():
            return {"success": False, "error": "Cabo already called"}

        current_player.has_called_cabo = True
        self.state.cabo_caller = message.player_id
        self.state.final_round_started = True

        # Trigger checkpoint for cabo call
        self._trigger_checkpoint()

        return {
            "success": True,
            "event": GameEvent("cabo_called", {
                "player": current_player.name,
                "player_id": message.player_id
            }),
            "next_messages": [NextTurnMessage()]
        }

    def _handle_next_turn(self, _: NextTurnMessage) -> Dict[str, Any]:
        """Handle moving to next turn"""
        # Check if game should end (if cabo was called and we're returning to caller)
        if self.is_cabo_called():
            next_index = (self.state.current_player_index +
                          1) % len(self.players)
            cabo_caller = self.get_player_by_id(self.state.cabo_caller)

            if next_index == self.players.index(cabo_caller):
                return {
                    "success": True,
                    "next_messages": [EndGameMessage()]
                }

        # Move to next player
        self.state.current_player_index = (
            self.state.current_player_index + 1) % len(self.players)
        self.state.phase = GamePhase.PLAYING

        self.state.drawn_card = None
        self.state.played_card = None

        # Trigger checkpoint for turn change
        self._trigger_checkpoint()

        return {
            "success": True,
            "event": GameEvent("turn_changed", {
                "current_player": self.get_current_player().player_id,
                "current_player_name": self.get_current_player().name
            })
        }

    def _handle_end_game(self, _: EndGameMessage) -> Dict[str, Any]:
        """Handle game end"""
        self.state.phase = GamePhase.ENDED

        # Calculate scores
        scores = [(player.player_id, player.name, player.get_score())
                  for player in self.players]
        scores.sort(key=lambda x: x[2])  # Sort by score

        self.state.winner = scores[0][0]  # Player with lowest score wins

        # Trigger checkpoint for game end
        self._trigger_checkpoint()

        return {
            "success": True,
            "event": GameEvent("game_ended", {
                "winner_id": scores[0][0],
                "winner_name": scores[0][1],
                "final_scores": [{"player_id": pid, "name": name, "score": score} for pid, name, score in scores]
            })
        }

    def _clear_stack_state(self):
        """Clear stack-related state"""
        self.state.stack_caller = None
        if self.state.stack_timer_id:
            self.pending_timeouts.pop(self.state.stack_timer_id, None)
            self.state.stack_timer_id = None
        self.state.phase = GamePhase.PLAYING

    def _clear_special_action_state(self):
        """Clear special action state"""
        self.state.special_action_player = None
        self.state.special_action_type = None
        if self.state.special_action_timer_id:
            self.pending_timeouts.pop(self.state.special_action_timer_id, None)
            self.state.special_action_timer_id = None

    def _clear_king_state(self):
        """Clear King-specific state"""
        self.state.king_viewed_card = None
        self.state.king_viewed_player = None
        self.state.king_viewed_index = None

    def _transition_after_special_action(self):
        """Transition to next phase after special action completes or times out"""
        if self.state.stack_caller is not None:
            # Move to stack phase instead of turn transition
            self.state.phase = GamePhase.STACK_CALLED
            self.state.stack_timer_id = self._schedule_timeout(
                StackTimeoutMessage(), 30.0)
        else:
            # Normal case: start turn transition timer
            self.state.phase = GamePhase.TURN_TRANSITION
            self.state.turn_transition_timer_id = self._schedule_timeout(
                TurnTransitionTimeoutMessage(), 5.0)
            
            # Broadcast phase change
            return {
                "success": True,
                "event": GameEvent("game_phase_changed", {
                    "phase": "turn_transition",
                    "current_player": self.get_current_player().player_id
                })
            }

    def _get_special_action_type(self, card: Card) -> str:
        """Get the type of special action for a card"""
        rank = card.rank.value
        if rank in [7, 8]:
            return "view_own"
        elif rank in [9, 10]:
            return "view_opponent"
        elif rank in [11, 12]:
            return "swap_opponent"
        elif rank == 13:
            return "king_effect"
        return "none"

    def _handle_view_own_card(self, message: ViewOwnCardMessage) -> Dict[str, Any]:
        """Handle viewing own card (7/8 effect)"""
        if self.state.special_action_player != message.player_id:
            return {"success": False, "error": "Not your special action"}

        if self.state.phase != GamePhase.WAITING_FOR_SPECIAL_ACTION:
            return {"success": False, "error": "Not in special action phase"}

        player = self.get_player_by_id(message.player_id)
        if not player:
            return {"success": False, "error": "Player not found"}

        if not (0 <= message.card_index < len(player.hand)):
            return {"success": False, "error": "Invalid card index"}

        # Add card to temporarily viewed cards
        self.state.temporarily_viewed_cards[player.player_id].add(
            (player.player_id, message.card_index))

        self._clear_special_action_state()

        # Transition to next phase (stack or turn transition)
        self._transition_after_special_action()

        return {
            "success": True,
            "event": GameEvent("card_viewed", {
                "player": player.name,
                "card": str(player.hand[message.card_index])
            })
        }

    def _handle_view_opponent_card(self, message: ViewOpponentCardMessage) -> Dict[str, Any]:
        """Handle viewing opponent card (9/10 effect)"""
        if self.state.special_action_player != message.player_id:
            return {"success": False, "error": "Not your special action"}

        if self.state.special_action_type != "view_opponent":
            return {"success": False, "error": "Not in view opponent phase"}

        if self.state.phase != GamePhase.WAITING_FOR_SPECIAL_ACTION:
            return {"success": False, "error": "Not in special action phase"}

        if message.target_player_id == message.player_id:
            return {"success": False, "error": "Cannot target yourself"}

        target_player = self.get_player_by_id(message.target_player_id)
        if not target_player:
            return {"success": False, "error": "Target player not found"}

        if not (0 <= message.card_index < len(target_player.hand)):
            return {"success": False, "error": "Invalid card index"}

        viewed_card = target_player.hand[message.card_index]

        # Add opponent's card to temporarily viewed cards for the viewer
        self.state.temporarily_viewed_cards[message.player_id].add(
            (message.target_player_id, message.card_index))

        self._clear_special_action_state()

        # Transition to next phase (stack or turn transition)
        self._transition_after_special_action()

        return {
            "success": True,
            "event": GameEvent("opponent_card_viewed", {
                "viewer": self.get_player_by_id(message.player_id).name,
                "target": target_player.name,
                "card": str(viewed_card)
            })
        }

    def _handle_swap_cards(self, message: SwapCardsMessage) -> Dict[str, Any]:
        """Handle swapping cards (J/Q effect)"""
        if self.state.special_action_player != message.player_id:
            return {"success": False, "error": "Not your special action"}

        if self.state.phase != GamePhase.WAITING_FOR_SPECIAL_ACTION:
            return {"success": False, "error": "Not in special action phase"}

        if message.target_player_id == message.player_id:
            return {"success": False, "error": "Cannot swap with yourself"}

        player = self.get_player_by_id(message.player_id)
        target_player = self.get_player_by_id(message.target_player_id)

        if not player or not target_player:
            return {"success": False, "error": "Player not found"}

        if not (0 <= message.own_index < len(player.hand)):
            return {"success": False, "error": "Invalid own card index"}

        if not (0 <= message.target_index < len(target_player.hand)):
            return {"success": False, "error": "Invalid target card index"}

        # Perform the swap
        player_card = player.hand[message.own_index]
        target_card = target_player.hand[message.target_index]

        player.hand[message.own_index] = target_card
        target_player.hand[message.target_index] = player_card

        self._clear_special_action_state()

        # Transition to next phase (stack or turn transition)
        self._transition_after_special_action()

        return {
            "success": True,
            "event": GameEvent("cards_swapped", {
                "player": player.name,
                "target": target_player.name,
                "player_card": str(player_card),
                "target_card": str(target_card)
            })
        }

    def _handle_king_view_card(self, message: KingViewCardMessage) -> Dict[str, Any]:
        """Handle King view any card (first stage)"""
        if self.state.special_action_player != message.player_id:
            return {"success": False, "error": "Not your special action"}

        if self.state.phase != GamePhase.KING_VIEW_PHASE:
            return {"success": False, "error": "Not in King view phase"}

        target_player = self.get_player_by_id(message.target_player_id)
        if not target_player:
            return {"success": False, "error": "Target player not found"}

        if not (0 <= message.card_index < len(target_player.hand)):
            return {"success": False, "error": "Invalid card index"}

        # Store viewed card info for potential swap
        self.state.king_viewed_card = target_player.hand[message.card_index]
        self.state.king_viewed_player = message.target_player_id
        self.state.king_viewed_index = message.card_index

        # Add card to temporarily viewed cards for the viewer
        self.state.temporarily_viewed_cards[message.player_id].add(
            (message.target_player_id, message.card_index))

        # Move to swap phase
        self.state.phase = GamePhase.KING_SWAP_PHASE

        return {
            "success": True,
            "event": GameEvent("king_card_viewed", {
                "viewer": self.get_player_by_id(message.player_id).name,
                "target": target_player.name,
                "card": str(self.state.king_viewed_card)
            })
        }

    def _handle_king_swap_cards(self, message: KingSwapCardsMessage) -> Dict[str, Any]:
        """Handle King swap cards (second stage, optional)"""
        if self.state.special_action_player != message.player_id:
            return {"success": False, "error": "Not your special action"}

        if self.state.phase != GamePhase.KING_SWAP_PHASE:
            return {"success": False, "error": "Not in King swap phase"}

        player = self.get_player_by_id(message.player_id)
        target_player = self.get_player_by_id(message.target_player_id)

        if not player or not target_player:
            return {"success": False, "error": "Player not found"}

        if not (0 <= message.own_index < len(player.hand)):
            return {"success": False, "error": "Invalid own card index"}

        if not (0 <= message.target_index < len(target_player.hand)):
            return {"success": False, "error": "Invalid target card index"}

        # Perform the swap
        player_card = player.hand[message.own_index]
        target_card = target_player.hand[message.target_index]

        player.hand[message.own_index] = target_card
        target_player.hand[message.target_index] = player_card

        self._clear_king_state()
        self._clear_special_action_state()

        # Transition to next phase (stack or turn transition)
        self._transition_after_special_action()

        return {
            "success": True,
            "event": GameEvent("king_cards_swapped", {
                "player": player.name,
                "target": target_player.name,
                "player_card": str(player_card),
                "target_card": str(target_card)
            })
        }

    def _handle_king_skip_swap(self, message: KingSkipSwapMessage) -> Dict[str, Any]:
        """Handle King skip swap (second stage, skip option)"""
        if self.state.special_action_player != message.player_id:
            return {"success": False, "error": "Not your special action"}

        if self.state.phase != GamePhase.KING_SWAP_PHASE:
            return {"success": False, "error": "Not in King swap phase"}

        self._clear_king_state()
        self._clear_special_action_state()

        # Transition to next phase (stack or turn transition)
        self._transition_after_special_action()

        return {
            "success": True,
            "event": GameEvent("king_swap_skipped", {
                "player": self.get_player_by_id(message.player_id).name
            })
        }

    def _handle_special_action_timeout(self, message: SpecialActionTimeoutMessage) -> Dict[str, Any]:
        """Handle special action timeout"""
        # Clear special action state
        self._clear_special_action_state()
        self._clear_king_state()

        # Transition to next phase (stack or turn transition)
        self._transition_after_special_action()

        return {
            "success": True,
            "event": GameEvent("special_action_timeout", {})
        }

    def _handle_setup_timeout(self, message: SetupTimeoutMessage) -> Dict[str, Any]:
        """Handle setup timeout - transition from SETUP to PLAYING"""
        # Clear setup timer
        if self.state.setup_timer_id:
            self.pending_timeouts.pop(self.state.setup_timer_id, None)
            self.state.setup_timer_id = None

        # Clear initial card visibility (players can no longer see their initial cards)
        self.state.temporarily_viewed_cards.clear()

        # Choose starting player and transition to PLAYING
        self.state.current_player_index = random.randint(
            0, len(self.players) - 1)
        self.state.phase = GamePhase.PLAYING

        # Trigger checkpoint for major phase change
        self._trigger_checkpoint()

        return {
            "success": True,
            "event": GameEvent("game_phase_changed", {
                "phase": "playing",
                "current_player": self.get_current_player().player_id,
                "current_player_name": self.get_current_player().name
            })
        }

    def _handle_turn_transition_timeout(self, message: TurnTransitionTimeoutMessage) -> Dict[str, Any]:
        """Handle turn transition timeout"""
        # Clear turn transition state
        if self.state.turn_transition_timer_id:
            self.pending_timeouts.pop(
                self.state.turn_transition_timer_id, None)
            self.state.turn_transition_timer_id = None

        # Clear all temporary card visibility
        self.state.temporarily_viewed_cards.clear()

        return {
            "success": True,
            "next_messages": [NextTurnMessage()]
        }

    def get_current_player(self) -> Player:
        return self.players[self.state.current_player_index]

    def get_player_by_id(self, player_id: str) -> Optional[Player]:
        for player in self.players:
            if player.player_id == player_id:
                return player
        return None

    def get_game_state(self, requesting_player_id: str) -> Dict[str, Any]:
        """Get current game state from perspective of requesting player"""
        player = self.get_player_by_id(requesting_player_id)
        if not player:
            return {"error": "Player not found"}

        # Build player states with appropriate visibility
        player_states = []
        for p in self.players:
            if p.player_id == requesting_player_id:
                # For requesting player: include visible card information
                viewed_tuples = self.state.temporarily_viewed_cards.get(
                    requesting_player_id, set())
                visible_cards = []

                # Convert tuples to format with actual card data
                for target_player_id, card_index in viewed_tuples:
                    target_player = self.get_player_by_id(target_player_id)
                    if target_player and 0 <= card_index < len(target_player.hand):
                        visible_cards.append({
                            "target_player_id": target_player_id,
                            "card_index": card_index,
                            "card": str(target_player.hand[card_index])
                        })

                player_states.append({
                    "player_id": p.player_id,
                    "name": p.name,
                    "hand_size": len(p.hand),
                    # [{target_player_id, card_index, card}]
                    "visible_cards": visible_cards,
                    "has_called_cabo": p.has_called_cabo
                })
            else:
                # Limited visibility for other players
                player_states.append({
                    "player_id": p.player_id,
                    "name": p.name,
                    "hand_size": len(p.hand),
                    "has_called_cabo": p.has_called_cabo
                })

        return {
            "game_id": self.game_id,
            "phase": self.state.phase.value,
            "current_player": self.get_current_player().player_id,
            "players": player_states,
            "deck_size": self.deck.size(),
            "discard_top": str(self.discard_pile[-1]) if self.discard_pile else None,
            "drawn_card": str(self.state.drawn_card) if (self.state.drawn_card and requesting_player_id == self.get_current_player().player_id) else None,
            "stack_caller": self.state.stack_caller,
            "cabo_caller": self.state.cabo_caller,
            "winner": self.state.winner,
            "special_action": {
                "player": self.state.special_action_player,
                "type": self.state.special_action_type
            } if self.state.special_action_player else None
        }
