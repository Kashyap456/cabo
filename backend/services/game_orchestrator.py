import asyncio
import logging
import time
from typing import Dict, List, Optional, Any
from datetime import datetime
import uuid
import json

from services.game_manager import (
    CaboGame, GameEvent, GameMessage, MessageType,
    DrawCardMessage, PlayDrawnCardMessage, ReplaceAndPlayMessage,
    CallStackMessage, ExecuteStackMessage, CallCaboMessage,
    ViewOwnCardMessage, ViewOpponentCardMessage, SwapCardsMessage,
    KingViewCardMessage, KingSwapCardsMessage, KingSkipSwapMessage,
    GamePhase
)
from services.connection_manager import ConnectionManager
from services.redis_manager import redis_manager
from services.redis_game_store import redis_game_store
from app.models import GameRoom, UserSession
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class GameOrchestrator:
    """Game orchestrator that uses Redis for state persistence and message queuing"""

    def __init__(self, connection_manager: ConnectionManager):
        self.connection_manager = connection_manager
        self.redis = redis_manager
        self.game_store = redis_game_store
        # room_id -> processing task
        self.processing_tasks: Dict[str, asyncio.Task] = {}
        # room_id -> event broadcasting task
        self.event_tasks: Dict[str, asyncio.Task] = {}

    async def create_game(self, room: GameRoom, players: List[UserSession], db: AsyncSession) -> None:
        """Creates new game and stores in Redis"""
        room_id = str(room.room_id)

        # Check if game already exists in Redis
        if await self.redis.is_game_active(room_id):
            logger.warning(f"Game already exists for room {room_id}")
            return

        # Extract player IDs and names
        player_ids = [str(p.user_id) for p in players]
        player_names = [p.nickname for p in players]

        # Create game callbacks - we'll handle events differently
        def broadcast_callback(event: GameEvent):
            # Do nothing here - events will be collected and published once
            pass

        def checkpoint_callback():
            # Checkpoint saves are handled after each message processing
            pass

        # Create game instance
        game = CaboGame(player_ids, player_names,
                        broadcast_callback, checkpoint_callback)
        

        # Save game to Redis
        await self.game_store.save_game(room_id, game, room.room_code)

        # Start processing tasks
        self.processing_tasks[room_id] = asyncio.create_task(
            self.process_game_messages(room_id)
        )
        self.event_tasks[room_id] = asyncio.create_task(
            self.broadcast_game_events(room_id)
        )

        logger.info(
            f"Created game for room {room_id} with {len(players)} players")

        # Broadcast initial game state
        await self._broadcast_game_state(room_id)

    async def process_game_messages(self, room_id: str):
        """Main game loop - processes messages from Redis queue"""
        logger.info(f"Starting message processor for room {room_id}")

        try:
            while True:
                # Check if game has ended
                if await self.game_store.is_game_ended(room_id):
                    logger.info(f"Game ended in room {room_id}")
                    break

                # Collect all available messages from Redis queue (non-blocking)
                # Redis queue is FIFO (LPUSH/BRPOP), so messages come out in order
                messages = []
                while True:
                    message_data = await self.redis.pop_message_non_blocking(room_id)
                    if message_data is not None:
                        messages.append(message_data)
                    else:
                        break

                # Always process (even with empty message list, to handle timeouts)
                try:
                    game_data = await self.game_store.load_game(room_id)

                    if not game_data:
                        logger.error(f"Failed to load game for room {room_id}")
                        continue

                    game, room_code = game_data
                    

                    # Add all messages to the game in FIFO order
                    for message_data in messages:
                        game_message = self._deserialize_message(message_data)
                        if game_message:
                            game.add_message(game_message)

                    # Process all messages and check timeouts
                    events = game.process_messages()
                    
                    if events:
                        logger.info(f"Generated {len(events)} events in room {room_id}: {[e.event_type for e in events]}")

                    # Save and publish if there were events or messages to process
                    if events or messages:
                        await self.game_store.save_game(room_id, game, room_code)

                        for event in events:
                            await self._publish_event(room_id, event)

                    # If no messages, wait before next iteration
                    if not messages:
                        await asyncio.sleep(0.1)

                except Exception as e:
                    logger.error(f"Error processing in room {room_id}: {e}")

        except asyncio.CancelledError:
            logger.info(f"Message processor cancelled for room {room_id}")
            raise
        except Exception as e:
            logger.error(
                f"Fatal error in message processor for room {room_id}: {e}")
        finally:
            await self.end_game(room_id)

    async def broadcast_game_events(self, room_id: str):
        """Reads events from Redis stream and broadcasts to clients"""
        logger.info(f"Starting event broadcaster for room {room_id}")

        # Start from the end of the stream (only new events from now on)
        # Using '$' means start from now, not from beginning
        last_id = '$'

        try:
            while True:
                # Check if game has ended
                if await self.game_store.is_game_ended(room_id):
                    break

                # Check if there are any connections
                room_sessions = self.connection_manager.get_room_sessions(
                    room_id)
                if not room_sessions:
                    # No connections, wait a bit
                    await asyncio.sleep(0.1)
                    continue

                # Read new events from stream using blocking read
                stream_key = f"stream:game:{room_id}:events"
                try:
                    # Use XREAD with block to wait for new events
                    result = await self.redis.redis.xread(
                        {stream_key: last_id},
                        count=10,
                        block=50  # Block for 50ms if no new events
                    )

                    if result:
                        for stream_name, events in result:
                            for event_id, data in events:
                                try:
                                    event_data = json.loads(
                                        data.get('event', '{}'))
                                    event_type = event_data.get('event_type', '')
                                    await self._broadcast_game_event(room_id, GameEvent(
                                        event_type=event_type,
                                        data=event_data.get('data', {}),
                                        timestamp=event_data.get(
                                            'timestamp', datetime.utcnow().isoformat())
                                    ))
                                    last_id = event_id
                                except Exception as e:
                                    logger.warning(
                                        f"Failed to broadcast event {event_id}: {e}")
                                    last_id = event_id
                except Exception as e:
                    # Handle Redis errors gracefully
                    if "NOGROUP" not in str(e):  # Ignore consumer group errors
                        logger.debug(
                            f"Stream read error for room {room_id}: {e}")
                    await asyncio.sleep(0.05)

        except asyncio.CancelledError:
            logger.info(f"Event broadcaster cancelled for room {room_id}")
            raise
        except Exception as e:
            logger.error(f"Error in event broadcaster for room {room_id}: {e}")

    async def handle_player_message(self, room_id: str, session_id: str, message: dict):
        """Converts WS message to game message and queues it in Redis"""
        # Check if game exists in Redis
        if not await self.redis.is_game_active(room_id):
            logger.warning(f"No active game for room {room_id}")
            await self.connection_manager.send_to_session(session_id, {
                "type": "error",
                "message": "No active game in this room"
            })
            return

        # Handle non-game messages first
        msg_type = message.get("type")

        # Handle ack_seq messages
        if msg_type == "ack_seq":
            seq_num = message.get("seq_num")
            if seq_num is not None:
                await self.redis.ack_sequence(room_id, session_id, seq_num)
                await self.connection_manager.acknowledge_sequence(room_id, session_id, seq_num)
            return

        # Handle get_session_info messages
        if msg_type == "get_session_info":
            await self.connection_manager.send_session_info(session_id, room_id)
            return

        # Convert to game message and queue
        message_data = {
            "session_id": session_id,
            "type": msg_type,
            "data": message,
            "timestamp": datetime.utcnow().isoformat()
        }

        # Push to Redis queue
        await self.redis.push_message(room_id, message_data)
        logger.debug(f"Queued {msg_type} from {session_id} in room {room_id}")

    def _deserialize_message(self, message_data: dict) -> Optional[GameMessage]:
        """Convert message data from Redis queue to GameMessage"""
        session_id = message_data.get("session_id")
        msg_type = message_data.get("type")
        data = message_data.get("data", {})

        try:
            if msg_type == "draw_card":
                return DrawCardMessage(player_id=session_id)
            elif msg_type == "play_drawn_card":
                return PlayDrawnCardMessage(player_id=session_id)
            elif msg_type == "replace_and_play":
                return ReplaceAndPlayMessage(
                    player_id=session_id,
                    hand_index=data.get("hand_index", 0)
                )
            elif msg_type == "call_stack":
                return CallStackMessage(player_id=session_id)
            elif msg_type == "execute_stack":
                return ExecuteStackMessage(
                    player_id=session_id,
                    card_index=data.get("card_index", 0),
                    target_player_id=data.get("target_player_id")
                )
            elif msg_type == "call_cabo":
                return CallCaboMessage(player_id=session_id)
            elif msg_type == "view_own_card":
                return ViewOwnCardMessage(
                    player_id=session_id,
                    card_index=data.get("card_index", 0)
                )
            elif msg_type == "view_opponent_card":
                return ViewOpponentCardMessage(
                    player_id=session_id,
                    target_player_id=data.get("target_player_id", ""),
                    card_index=data.get("card_index", 0)
                )
            elif msg_type == "swap_cards":
                return SwapCardsMessage(
                    player_id=session_id,
                    own_index=data.get("own_index", 0),
                    target_player_id=data.get("target_player_id", ""),
                    target_index=data.get("target_index", 0)
                )
            elif msg_type == "king_view_card":
                return KingViewCardMessage(
                    player_id=session_id,
                    target_player_id=data.get("target_player_id", ""),
                    card_index=data.get("card_index", 0)
                )
            elif msg_type == "king_swap_cards":
                return KingSwapCardsMessage(
                    player_id=session_id,
                    own_index=data.get("own_index", 0),
                    target_player_id=data.get("target_player_id", ""),
                    target_index=data.get("target_index", 0)
                )
            elif msg_type == "king_skip_swap":
                return KingSkipSwapMessage(player_id=session_id)
            else:
                logger.warning(f"Unknown message type: {msg_type}")
                return None

        except Exception as e:
            logger.error(f"Error deserializing message: {e}")
            return None

    async def _publish_event(self, room_id: str, event: GameEvent):
        """Publish game event to Redis stream"""
        event_data = {
            "event_type": event.event_type,
            "data": event.data,
            "timestamp": event.timestamp
        }
        await self.redis.publish_event(room_id, event_data)

    async def _broadcast_game_event(self, room_id: str, event: GameEvent):
        """Broadcast game event to all players in room with sequence numbers"""
        # Special handling for card_drawn event
        if event.event_type == "card_drawn":
            player_id = event.data.get("player_id")
            card_str = event.data.get("card")

            # Send personalized events
            room_sessions = self.connection_manager.get_room_sessions(room_id)
            for session_id in room_sessions:
                event_data = dict(event.data)
                if session_id == player_id:
                    # Drawing player sees the actual card
                    event_data["card"] = card_str
                else:
                    # Others see "hidden"
                    event_data["card"] = "hidden"

                # Create personalized message with sequencer
                personalized_msg = self.connection_manager.sequencer.add_message(
                    room_id, "game_event", {
                        "event_type": event.event_type,
                        "data": event_data,
                        "timestamp": event.timestamp
                    }
                )

                await self.connection_manager.send_to_session(session_id, personalized_msg.to_dict())
        else:
            # Normal broadcast for other events using sequencer
            await self.connection_manager.send_sequenced_message(room_id, "game_event", {
                "event_type": event.event_type,
                "data": event.data,
                "timestamp": event.timestamp
            })

    async def _broadcast_game_state(self, room_id: str):
        """Broadcast personalized game state to all players"""
        game_data = await self.game_store.load_game(room_id)
        if not game_data:
            logger.error(
                f"No game found for room {room_id} when broadcasting state")
            return

        game, room_code = game_data
        room_sessions = self.connection_manager.get_room_sessions(room_id)

        for session_id in room_sessions:
            checkpoint_data = self._create_player_checkpoint_data(
                game, session_id, room_id, room_code)

            # Create checkpoint with sequencer (without incrementing)
            checkpoint = self.connection_manager.sequencer.create_player_checkpoint(
                room_id, session_id, "IN_GAME", checkpoint_data, increment_seq=False
            )

            await self.connection_manager.send_to_session(session_id, checkpoint.to_dict())

        logger.info(
            f"Broadcasted game state to {len(room_sessions)} players in room {room_id}")

    async def _create_player_checkpoint(self, room_id: str, session_id: str):
        """Helper to create a checkpoint for a single player"""
        game_data = await self.game_store.load_game(room_id)
        if not game_data:
            logger.error(
                f"No game found for room {room_id} when creating checkpoint")
            return

        game, room_code = game_data

        # Create personalized checkpoint data for this player
        checkpoint_data = self._create_player_checkpoint_data(
            game, session_id, room_id, room_code)

        # Store checkpoint without incrementing sequence
        self.connection_manager.sequencer.create_player_checkpoint(
            room_id, session_id, "IN_GAME", checkpoint_data, increment_seq=False
        )

        logger.info(
            f"Created checkpoint for player {session_id} in room {room_id}")

    def _create_player_checkpoint_data(self, game: CaboGame, session_id: str, room_id: str, room_code: str) -> Dict[str, Any]:
        """Create checkpoint data personalized for a specific player"""
        from app.routers.ws import serialize_card_for_player

        player = game.get_player_by_id(session_id)
        if not player:
            logger.warning(f"Player {session_id} not found in game {room_id}")
            return {}

        current_player_id = game.get_current_player().player_id if game.players else None

        return {
            "room": {
                "room_id": room_id,
                "room_code": room_code,
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
                "drawn_card": serialize_card_for_player(
                    game.state.drawn_card, session_id, "drawn", 0, {}
                ) if game.state.drawn_card and session_id == current_player_id else None,
                "special_action": {
                    "type": game.state.special_action_type,
                    "player_id": game.state.special_action_player
                } if game.state.special_action_player else None,
                "stack_caller": game.state.stack_caller,
                "cabo_called_by": game.state.cabo_caller,
                "final_round_started": game.state.final_round_started
            }
        }

    async def end_game(self, room_id: str):
        """Clean up game resources"""
        logger.info(f"Cleaning up game for room {room_id}")

        # Cancel processing tasks
        if room_id in self.processing_tasks:
            self.processing_tasks[room_id].cancel()
            del self.processing_tasks[room_id]

        if room_id in self.event_tasks:
            self.event_tasks[room_id].cancel()
            del self.event_tasks[room_id]

        # Clean up Redis data
        await self.redis.cleanup_game(room_id)

        # Notify all players
        await self.connection_manager.broadcast_to_room(room_id, {
            "type": "game_cleanup",
            "message": "Game has ended"
        })

    def get_game(self, room_id: str) -> Optional[CaboGame]:
        """Get game instance for a room (loads from Redis)"""
        # This is synchronous in the original, but we need it async for Redis
        # Return None for now, caller should use async version
        logger.warning(
            "Synchronous get_game called, use async version instead")
        return None

    async def get_game_async(self, room_id: str) -> Optional[CaboGame]:
        """Get game instance for a room (loads from Redis)"""
        game_data = await self.game_store.load_game(room_id)
        return game_data[0] if game_data else None

    def is_game_active(self, room_id: str) -> bool:
        """Check if a game is active for a room (synchronous wrapper)"""
        # This needs to be async, but keeping sync for compatibility
        # Will need to be called with asyncio.run or in async context
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Create a task and hope it gets awaited elsewhere
                future = asyncio.ensure_future(
                    self.redis.is_game_active(room_id))
                # Can't wait for it here, so return False as safe default
                return False
            else:
                return loop.run_until_complete(self.redis.is_game_active(room_id))
        except:
            return False

    async def is_game_active_async(self, room_id: str) -> bool:
        """Check if a game is active for a room (async version)"""
        return await self.redis.is_game_active(room_id)

    @classmethod
    async def restore_all_active_games(cls, connection_manager: ConnectionManager) -> 'GameOrchestrator':
        """Create orchestrator and restore all active games from Redis"""
        orchestrator = cls(connection_manager)

        try:
            # Get all active games from Redis
            active_games = await redis_game_store.list_active_games()

            for game_info in active_games:
                room_id = game_info['room_id']

                # Start processing tasks for each active game
                orchestrator.processing_tasks[room_id] = asyncio.create_task(
                    orchestrator.process_game_messages(room_id)
                )
                orchestrator.event_tasks[room_id] = asyncio.create_task(
                    orchestrator.broadcast_game_events(room_id)
                )

                logger.info(f"Restored game for room {room_id}")

            logger.info(
                f"Restored {len(active_games)} active games from Redis")

        except Exception as e:
            logger.error(f"Error restoring active games: {e}")

        return orchestrator

    # Compatibility methods for migration from database persistence
    async def restore_game_from_checkpoint(self, room_id: str, db: AsyncSession) -> bool:
        """Restore a game from database checkpoint (no longer used, kept for compatibility)"""
        logger.warning(
            "restore_game_from_checkpoint called but using Redis now")
        return await self.is_game_active_async(room_id)

    async def _persist_game_state(self, room_id: str):
        """Persist game state (no longer needed with Redis, kept for compatibility)"""
        logger.debug(
            "_persist_game_state called but Redis handles persistence automatically")
        pass
