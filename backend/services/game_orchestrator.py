import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import uuid

from services.game_manager import (
    CaboGame, GameEvent, GameMessage, MessageType,
    DrawCardMessage, PlayDrawnCardMessage, ReplaceAndPlayMessage,
    CallStackMessage, ExecuteStackMessage, CallCaboMessage,
    ViewOwnCardMessage, ViewOpponentCardMessage, SwapCardsMessage,
    KingViewCardMessage, KingSwapCardsMessage, KingSkipSwapMessage,
    GamePhase
)
from services.connection_manager import ConnectionManager
from app.models import GameRoom, UserSession
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class GameOrchestrator:
    def __init__(self, connection_manager: ConnectionManager):
        self.active_games: Dict[str, CaboGame] = {}  # room_id -> CaboGame
        self.game_queues: Dict[str, asyncio.Queue] = {}  # room_id -> Queue
        self.game_tasks: Dict[str, asyncio.Task] = {}  # room_id -> Task
        self.room_codes: Dict[str, str] = {}  # room_id -> room_code
        self.connection_manager = connection_manager

    async def create_game(self, room: GameRoom, players: List[UserSession], db: AsyncSession) -> None:
        """Creates new CaboGame instance from room data"""
        room_id = str(room.room_id)

        if room_id in self.active_games:
            logger.warning(f"Game already exists for room {room_id}")
            return

        # Extract player IDs and names
        player_ids = [str(p.user_id) for p in players]
        player_names = [p.nickname for p in players]

        # Create broadcast callback
        def broadcast_callback(event: GameEvent):
            asyncio.create_task(self._broadcast_game_event(room_id, event))

        # Create checkpoint callback
        def checkpoint_callback():
            asyncio.create_task(self._create_game_checkpoint(room_id))

        # Create game instance
        game = CaboGame(player_ids, player_names,
                        broadcast_callback, checkpoint_callback)
        self.active_games[room_id] = game
        self.room_codes[room_id] = room.room_code

        # Create message queue
        self.game_queues[room_id] = asyncio.Queue()

        # Start game processing loop
        self.game_tasks[room_id] = asyncio.create_task(
            self.process_game_loop(room_id)
        )

        logger.info(
            f"Created game for room {room_id} with {len(players)} players")

        # Create initial game checkpoint (stored but not broadcast)
        await self._broadcast_game_state(room_id)

    async def process_game_loop(self, room_id: str):
        """Main game loop - processes messages from queue"""
        logger.info(f"Starting game loop for room {room_id}")

        game = self.active_games.get(room_id)
        queue = self.game_queues.get(room_id)

        if not game or not queue:
            logger.error(f"Game or queue not found for room {room_id}")
            return

        try:
            while game.state.phase != GamePhase.ENDED:
                try:
                    # Wait for next message with timeout
                    message = await asyncio.wait_for(queue.get(), timeout=0.1)

                    # Process the message
                    game.add_message(message)
                    events = game.process_messages()

                    # Events are already broadcast via callback
                    # Just log for debugging
                    for event in events:
                        logger.debug(
                            f"Game {room_id} event: {event.event_type}")

                except asyncio.TimeoutError:
                    # No messages, just check timeouts
                    game.process_messages()

                except Exception as e:
                    logger.error(
                        f"Error processing message in room {room_id}: {e}")

            # Game ended
            logger.info(f"Game ended in room {room_id}")
            await self.end_game(room_id)

        except Exception as e:
            logger.error(f"Fatal error in game loop for room {room_id}: {e}")
            await self.end_game(room_id)

    async def handle_player_message(self, room_id: str, session_id: str, message: dict):
        """Converts WS message to game message and queues it"""
        if room_id not in self.active_games:
            logger.warning(f"No active game for room {room_id}")
            await self.connection_manager.send_to_session(session_id, {
                "type": "error",
                "message": "No active game in this room"
            })
            return

        game = self.active_games[room_id]
        queue = self.game_queues.get(room_id)

        if not queue:
            logger.error(f"No queue found for room {room_id}")
            return

        # Validate player is in game
        player = game.get_player_by_id(session_id)
        if not player:
            await self.connection_manager.send_to_session(session_id, {
                "type": "error",
                "message": "You are not in this game"
            })
            return

        # Convert to appropriate GameMessage type
        msg_type = message.get("type")
        game_message = None

        try:
            if msg_type == "draw_card":
                game_message = DrawCardMessage(player_id=session_id)
            elif msg_type == "play_drawn_card":
                game_message = PlayDrawnCardMessage(player_id=session_id)
            elif msg_type == "replace_and_play":
                game_message = ReplaceAndPlayMessage(
                    player_id=session_id,
                    hand_index=message.get("hand_index", 0)
                )
            elif msg_type == "call_stack":
                game_message = CallStackMessage(player_id=session_id)
            elif msg_type == "execute_stack":
                game_message = ExecuteStackMessage(
                    player_id=session_id,
                    card_index=message.get("card_index", 0),
                    target_player_id=message.get("target_player_id")
                )
            elif msg_type == "call_cabo":
                game_message = CallCaboMessage(player_id=session_id)
            elif msg_type == "view_own_card":
                game_message = ViewOwnCardMessage(
                    player_id=session_id,
                    card_index=message.get("card_index", 0)
                )
            elif msg_type == "view_opponent_card":
                game_message = ViewOpponentCardMessage(
                    player_id=session_id,
                    target_player_id=message.get("target_player_id", ""),
                    card_index=message.get("card_index", 0)
                )
            elif msg_type == "swap_cards":
                game_message = SwapCardsMessage(
                    player_id=session_id,
                    own_index=message.get("own_index", 0),
                    target_player_id=message.get("target_player_id", ""),
                    target_index=message.get("target_index", 0)
                )
            elif msg_type == "king_view_card":
                game_message = KingViewCardMessage(
                    player_id=session_id,
                    target_player_id=message.get("target_player_id", ""),
                    card_index=message.get("card_index", 0)
                )
            elif msg_type == "king_swap_cards":
                game_message = KingSwapCardsMessage(
                    player_id=session_id,
                    own_index=message.get("own_index", 0),
                    target_player_id=message.get("target_player_id", ""),
                    target_index=message.get("target_index", 0)
                )
            elif msg_type == "king_skip_swap":
                game_message = KingSkipSwapMessage(player_id=session_id)
            else:
                await self.connection_manager.send_to_session(session_id, {
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}"
                })
                return

            # Add to game queue
            await queue.put(game_message)
            logger.debug(
                f"Queued {msg_type} from {session_id} in room {room_id}")

        except Exception as e:
            logger.error(f"Error creating game message: {e}")
            await self.connection_manager.send_to_session(session_id, {
                "type": "error",
                "message": f"Invalid message: {str(e)}"
            })

    async def end_game(self, room_id: str):
        """Clean up game resources"""
        logger.info(f"Cleaning up game for room {room_id}")

        # Cancel processing task
        if room_id in self.game_tasks:
            self.game_tasks[room_id].cancel()
            del self.game_tasks[room_id]

        # Remove from active games
        if room_id in self.active_games:
            del self.active_games[room_id]

        # Clean up queue
        if room_id in self.game_queues:
            del self.game_queues[room_id]

        # Clean up room code
        if room_id in self.room_codes:
            del self.room_codes[room_id]

        # Notify all players
        await self.connection_manager.broadcast_to_room(room_id, {
            "type": "game_cleanup",
            "message": "Game has ended"
        })

    async def _broadcast_game_event(self, room_id: str, event: GameEvent):
        """Broadcast game event to all players in room with sequence number"""
        await self.connection_manager.send_sequenced_message(room_id, "game_event", {
            "event_type": event.event_type,
            "data": event.data,
            "timestamp": event.timestamp
        })

    async def _broadcast_game_state(self, room_id: str):
        """Broadcast personalized room_in_game_state messages to all players"""
        game = self.active_games.get(room_id)
        if not game:
            logger.error(
                f"No game found for room {room_id} when broadcasting game state")
            return

        # Get all connected players
        room_sessions = self.connection_manager.get_room_sessions(room_id)

        for session_id in room_sessions:
            # Create personalized checkpoint data for this player
            checkpoint_data = self._create_player_checkpoint_data(
                game, session_id, room_id)

            # Create and send personalized room_in_game_state message
            checkpoint = self.connection_manager.sequencer.create_player_checkpoint(
                room_id, session_id, "IN_GAME", checkpoint_data)
            await self.connection_manager.send_to_session(session_id, checkpoint.to_dict())

        logger.info(
            f"Broadcasted game state to {len(room_sessions)} players in room {room_id}")

    async def _create_game_checkpoint(self, room_id: str):
        """Create personalized checkpoints for all players in the game"""
        game = self.active_games.get(room_id)
        if not game:
            logger.error(
                f"No game found for room {room_id} when creating checkpoint")
            return

        # Get all connected players
        room_sessions = self.connection_manager.get_room_sessions(room_id)

        for session_id in room_sessions:
            await self._create_player_checkpoint(room_id, session_id)

    async def _create_player_checkpoint(self, room_id: str, session_id: str):
        """Helper to create a checkpoint for a single player"""
        game = self.active_games.get(room_id)
        if not game:
            logger.error(
                f"No game found for room {room_id} when creating checkpoint")
            return

        # Create personalized checkpoint data for this player
        checkpoint_data = self._create_player_checkpoint_data(
            game, session_id, room_id)

        # Store checkpoint (but don't broadcast it)
        self.connection_manager.sequencer.create_player_checkpoint(
            room_id, session_id, "IN_GAME", checkpoint_data)
        logger.info(
            f"Created checkpoint for player {session_id} in room {room_id}")

    def _create_player_checkpoint_data(self, game: CaboGame, session_id: str, room_id: str) -> Dict[str, Any]:
        """Create checkpoint data personalized for a specific player"""
        from app.routers.ws import serialize_card_for_player

        # Find the player in the game
        player = game.get_player_by_id(session_id)
        if not player:
            logger.warning(f"Player {session_id} not found in game {room_id}")
            return {}

        current_player_id = game.get_current_player().player_id if game.players else None

        return {
            "room": {
                "room_id": room_id,
                "room_code": self.room_codes.get(room_id, ''),
            },
            "game": {
                "current_player_id": current_player_id,
                "phase": game.state.phase.value,
                "turn_number": getattr(game.state, 'turn_number', 1),
                "players": [
                    {
                        "id": p.player_id,
                        "nickname": p.name,
                        "cards": [
                            serialize_card_for_player(
                                p.hand[card_index],
                                session_id,
                                p.player_id,
                                card_index,
                                game.state.temporarily_viewed_cards
                            )
                            for card_index in range(len(p.hand))
                        ],
                        "has_called_cabo": p.has_called_cabo
                    }
                    for p in game.players
                ],
                "top_discard_card": serialize_card_for_player(
                    game.discard_pile[-1], session_id, "discard", 0, {}
                ) if game.discard_pile else None,
                "played_card": serialize_card_for_player(
                    game.state.played_card, session_id, "played", 0, {}
                ) if game.state.played_card else None,
                "special_action": {
                    "type": game.state.special_action_type,
                    "player_id": game.state.special_action_player
                } if game.state.special_action_player else None,
                "stack_caller": game.state.stack_caller,
                "cabo_called_by": game.state.cabo_caller,
                "final_round_started": game.state.final_round_started
            }
        }

    def get_game(self, room_id: str) -> Optional[CaboGame]:
        """Get game instance for a room"""
        return self.active_games.get(room_id)

    def is_game_active(self, room_id: str) -> bool:
        """Check if a game is active for a room"""
        return room_id in self.active_games
