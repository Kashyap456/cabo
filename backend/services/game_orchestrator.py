from services.checkpoint_manager import CheckpointManager
from services.stream_manager import StreamManager
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
    KingViewCardMessage, KingSwapCardsMessage, KingSkipSwapMessage, SkipSwapMessage,
    GamePhase
)
from services.connection_manager import ConnectionManager
from services.redis_manager import redis_manager
from services.redis_game_store import redis_game_store
from services.room_manager import room_manager
from app.models import GameRoom, UserSession
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db

logger = logging.getLogger(__name__)


class GameOrchestrator:
    """Game orchestrator that uses Redis Streams and unified checkpoints"""

    def __init__(self, connection_manager: ConnectionManager):
        self.connection_manager = connection_manager
        self.redis = redis_manager
        self.game_store = redis_game_store
        self.stream_manager = StreamManager(redis_manager.redis)
        self.checkpoint_manager = CheckpointManager(redis_manager.redis)
        # room_id -> processing task
        self.processing_tasks: Dict[str, asyncio.Task] = {}
        # NO MORE event_tasks - broadcasting handled by stream_manager

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

        # Create game instance
        game = CaboGame(player_ids, player_names)

        # Save game to Redis
        await self.game_store.save_game(room_id, game, room.room_code)

        # Manually publish the initial game_started event
        await self.stream_manager.publish_event(
            room_id,
            "game_started",
            {
                "phase": "setup",
                "setup_time_seconds": 10
            }
        )

        # Create and broadcast initial checkpoint so clients have game state
        await self._create_checkpoint_async(room_id, broadcast=True)

        # Start processing messages
        self.processing_tasks[room_id] = asyncio.create_task(
            self.process_game_messages(room_id)
        )

        # Start broadcasting from stream
        await self.stream_manager.start_broadcast(
            room_id,
            self.connection_manager,
            from_position="0"  # Start from beginning for new game
        )

        logger.info(
            f"Created game for room {room_id} with {len(players)} players")

    async def process_game_messages(self, room_id: str):
        """Main game loop - processes messages from Redis queue"""
        logger.info(f"Starting message processor for room {room_id}")

        # Load game ONCE at startup and keep it in memory
        initial_game_data = await self.game_store.load_game(room_id)
        if not initial_game_data:
            logger.error(f"Failed to load initial game for room {room_id}")
            return

        game, room_code = initial_game_data

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
                    # Use the IN-MEMORY game instance - DON'T reload from Redis!
                    # This preserves state changes like drawn_card between iterations

                    # Add all messages to the game in FIFO order
                    for message_data in messages:
                        game_message = self._deserialize_message(message_data)
                        if game_message:
                            game.add_message(game_message)

                    # Process all messages and check timeouts
                    events = game.process_messages()

                    if events:
                        logger.info(
                            f"Generated {len(events)} events in room {room_id}: {[e.event_type for e in events]}")

                    # Save and publish if there were events or messages to process
                    if events or messages:
                        await self.game_store.save_game(room_id, game, room_code)
                        
                        # Update room activity in database
                        try:
                            async for db in get_db():
                                await room_manager.update_room_activity(db, room_id)
                                break
                        except Exception as e:
                            logger.error(f"Failed to update room activity: {e}")

                        # Publish events to stream
                        for event in events:
                            await self.stream_manager.publish_event(
                                room_id,
                                event.event_type,
                                event.data
                            )
                            
                            # Schedule cleanup when game ends
                            if event.event_type == "game_ended":
                                logger.info(f"Game ended in room {room_id}, scheduling cleanup")
                                asyncio.create_task(self.schedule_game_cleanup(room_id, delay_seconds=30))

                        # Always create checkpoint after processing messages
                        # This ensures reconnecting players get the latest state
                        await self._create_checkpoint_async(room_id, game)

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

    async def _create_checkpoint_async(self, room_id: str, game=None, broadcast=False):
        """Create checkpoint when game requests it (phase changes)"""
        try:
            # If no game instance provided, load from Redis (for initial creation)
            if game is None:
                game_data = await self.game_store.load_game(room_id)
                if not game_data:
                    return
                game, _ = game_data

            current_seq = self.connection_manager.get_next_sequence(room_id)

            checkpoint = await self.checkpoint_manager.create_checkpoint(
                room_id, game, current_seq
            )

            # Only broadcast initial checkpoint or when explicitly requested
            if broadcast:
                await self.stream_manager.publish_event(
                    room_id,
                    "checkpoint_created",
                    checkpoint.to_dict()
                )

            logger.info(
                f"Created checkpoint for room {room_id} at phase {game.state.phase.value}")

        except Exception as e:
            logger.error(f"Failed to create checkpoint: {e}")

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
            elif msg_type == "skip_swap":
                return SkipSwapMessage(player_id=session_id)
            elif msg_type == "king_skip_swap":
                return KingSkipSwapMessage(player_id=session_id)
            else:
                logger.warning(f"Unknown message type: {msg_type}")
                return None

        except Exception as e:
            logger.error(f"Error deserializing message: {e}")
            return None

    async def handle_player_reconnection(
        self,
        room_id: str,
        session_id: str,
        websocket
    ):
        """Handle reconnecting player with checkpoint + replay"""

        # Get latest checkpoint
        checkpoint = await self.checkpoint_manager.get_latest_checkpoint(room_id)
        print(f"Checkpoint: {checkpoint}")
        if not checkpoint:
            logger.warning(
                f"No checkpoint for room {room_id}, cannot handle reconnection")
            # Send an error or empty ready signal
            await websocket.send_json({
                "type": "error",
                "message": "No game state available for reconnection"
            })
            return

        # Send checkpoint
        await websocket.send_json(checkpoint.to_dict())

        # Get player's last position
        last_position = await self.stream_manager.get_player_position(room_id, session_id)

        # Use checkpoint position if player has no recorded position
        start_position = last_position or checkpoint.stream_position

        # Get missed events
        missed_events = await self.stream_manager.get_events_since(
            room_id,
            start_position
        )

        # Send missed events with sequence numbers
        for stream_id, event_data in missed_events:
            seq_num = self.connection_manager.get_next_sequence(room_id)
            await websocket.send_json({
                "type": "game_event",
                "stream_id": stream_id,
                "seq_num": seq_num,
                **event_data
            })

        # Send ready signal
        await websocket.send_json({
            "type": "ready",
            "checkpoint_id": checkpoint.checkpoint_id,
            "events_replayed": len(missed_events)
        })

        logger.info(
            f"Reconnected {session_id}: checkpoint {checkpoint.checkpoint_id}, "
            f"replayed {len(missed_events)} events"
        )

    async def schedule_game_cleanup(self, room_id: str, delay_seconds: int = 30):
        """Schedule game cleanup after delay"""
        logger.info(f"Scheduling game cleanup for room {room_id} in {delay_seconds} seconds")
        
        # Send countdown updates
        remaining = delay_seconds
        while remaining > 0:
            await self.connection_manager.broadcast_to_room(room_id, {
                "type": "cleanup_countdown",
                "data": {"remaining_seconds": remaining}
            })
            
            # Wait 5 seconds or until next update
            wait_time = min(5, remaining)
            await asyncio.sleep(wait_time)
            remaining -= wait_time
        
        # Send redirect message
        await self.connection_manager.broadcast_to_room(room_id, {
            "type": "redirect_home",
            "data": {"reason": "game_ended"}
        })
        
        # Give clients a moment to process redirect
        await asyncio.sleep(1)
        
        # Now do the actual cleanup
        await self.end_game(room_id)

    async def end_game(self, room_id: str):
        """Clean up game resources"""
        logger.info(f"Cleaning up game for room {room_id}")

        # Cancel processing tasks
        if room_id in self.processing_tasks:
            self.processing_tasks[room_id].cancel()
            del self.processing_tasks[room_id]

        # Stop stream broadcasting
        await self.stream_manager.stop_broadcast(room_id)

        # Clean up Redis data
        await self.redis.cleanup_game(room_id)

        # Clean up stream and checkpoints
        await self.stream_manager.cleanup_stream(room_id)
        await self.checkpoint_manager.cleanup_checkpoints(room_id)

        # Close all WebSocket connections for this room
        await self.connection_manager.close_room_connections(room_id)

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

                # Start broadcasting from last checkpoint
                checkpoint = await orchestrator.checkpoint_manager.get_latest_checkpoint(room_id)
                from_position = checkpoint.stream_position if checkpoint else "0"

                await orchestrator.stream_manager.start_broadcast(
                    room_id,
                    connection_manager,
                    from_position
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
