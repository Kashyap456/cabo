import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models import GameCheckpoint, GameRoom
from services.game_manager import CaboGame, Card, Rank, Suit, Player, GameState, GamePhase
from services.connection_manager import ConnectionManager

logger = logging.getLogger(__name__)


class GamePersistence:
    """Handles serialization, persistence, and restoration of game states"""

    @staticmethod
    def serialize_card(card: Card) -> Dict[str, Any]:
        """Serialize a Card object to JSON-compatible dict"""
        return {
            "rank": card.rank.value,
            "suit": card.suit.value if card.suit else None
        }

    @staticmethod
    def deserialize_card(card_data: Dict[str, Any]) -> Card:
        """Deserialize a dict back to Card object"""
        rank = Rank(card_data["rank"])
        suit = Suit(card_data["suit"]) if card_data["suit"] else None
        return Card(rank, suit)

    @staticmethod
    def serialize_player(player: Player) -> Dict[str, Any]:
        """Serialize a Player object to JSON-compatible dict"""
        return {
            "player_id": player.player_id,
            "name": player.name,
            "hand": [GamePersistence.serialize_card(card) for card in player.hand],
            "has_called_cabo": player.has_called_cabo
        }

    @staticmethod
    def deserialize_player(player_data: Dict[str, Any]) -> Player:
        """Deserialize a dict back to Player object"""
        player = Player(player_data["player_id"], player_data["name"])
        player.hand = [GamePersistence.deserialize_card(card_data) for card_data in player_data["hand"]]
        player.has_called_cabo = player_data["has_called_cabo"]
        return player

    @staticmethod
    def serialize_game_state(game: CaboGame, room_code: str, sequence_number: int) -> Dict[str, Any]:
        """Serialize complete game state to JSON-compatible dict"""
        # Convert defaultdict to regular dict for JSON serialization
        viewed_cards = {}
        for viewer_id, viewed_set in game.state.temporarily_viewed_cards.items():
            viewed_cards[viewer_id] = list(viewed_set)

        return {
            "version": "1.0",
            "game_id": game.game_id,
            "room_code": room_code,
            "sequence_number": sequence_number,
            "players": [GamePersistence.serialize_player(player) for player in game.players],
            "deck": [GamePersistence.serialize_card(card) for card in game.deck.cards],
            "discard_pile": [GamePersistence.serialize_card(card) for card in game.discard_pile],
            "state": {
                "phase": game.state.phase.value,
                "current_player_index": game.state.current_player_index,
                "drawn_card": GamePersistence.serialize_card(game.state.drawn_card) if game.state.drawn_card else None,
                "played_card": GamePersistence.serialize_card(game.state.played_card) if game.state.played_card else None,
                "stack_caller": game.state.stack_caller,
                "stack_timer_id": game.state.stack_timer_id,
                "special_action_player": game.state.special_action_player,
                "special_action_type": game.state.special_action_type,
                "special_action_timer_id": game.state.special_action_timer_id,
                "king_viewed_card": GamePersistence.serialize_card(game.state.king_viewed_card) if game.state.king_viewed_card else None,
                "king_viewed_player": game.state.king_viewed_player,
                "king_viewed_index": game.state.king_viewed_index,
                "turn_transition_timer_id": game.state.turn_transition_timer_id,
                "setup_timer_id": game.state.setup_timer_id,
                "cabo_caller": game.state.cabo_caller,
                "final_round_started": game.state.final_round_started,
                "winner": game.state.winner,
                "temporarily_viewed_cards": viewed_cards
            },
            "pending_timeouts": game.pending_timeouts,
            "timestamp": datetime.utcnow().isoformat()
        }

    @staticmethod
    def deserialize_game_state(
        game_data: Dict[str, Any], 
        broadcast_callback: Optional[callable] = None,
        checkpoint_callback: Optional[callable] = None
    ) -> tuple[CaboGame, str]:
        """Deserialize JSON data back to CaboGame object"""
        
        # Create new game with empty initialization
        player_ids = [p["player_id"] for p in game_data["players"]]
        player_names = [p["name"] for p in game_data["players"]]
        
        # Create game but don't let it deal initial cards or setup timers
        game = CaboGame.__new__(CaboGame)  # Create without calling __init__
        
        # Set basic attributes
        game.game_id = game_data["game_id"]
        game.broadcast_callback = broadcast_callback
        game.checkpoint_callback = checkpoint_callback
        game.message_queue = game.message_queue if hasattr(game, 'message_queue') else None
        
        # Restore deck
        from services.game_manager import Deck
        game.deck = Deck.__new__(Deck)
        game.deck.cards = [GamePersistence.deserialize_card(card_data) for card_data in game_data["deck"]]
        
        # Restore discard pile
        game.discard_pile = [GamePersistence.deserialize_card(card_data) for card_data in game_data["discard_pile"]]
        
        # Restore players
        game.players = [GamePersistence.deserialize_player(player_data) for player_data in game_data["players"]]
        
        # Restore game state
        state_data = game_data["state"]
        from collections import defaultdict
        
        viewed_cards = defaultdict(set)
        for viewer_id, viewed_list in state_data["temporarily_viewed_cards"].items():
            viewed_cards[viewer_id] = set(tuple(item) if isinstance(item, list) else item for item in viewed_list)
        
        game.state = GameState(
            phase=GamePhase(state_data["phase"]),
            current_player_index=state_data["current_player_index"],
            drawn_card=GamePersistence.deserialize_card(state_data["drawn_card"]) if state_data["drawn_card"] else None,
            played_card=GamePersistence.deserialize_card(state_data["played_card"]) if state_data["played_card"] else None,
            stack_caller=state_data["stack_caller"],
            stack_timer_id=state_data["stack_timer_id"],
            special_action_player=state_data["special_action_player"],
            special_action_type=state_data["special_action_type"],
            special_action_timer_id=state_data["special_action_timer_id"],
            king_viewed_card=GamePersistence.deserialize_card(state_data["king_viewed_card"]) if state_data["king_viewed_card"] else None,
            king_viewed_player=state_data["king_viewed_player"],
            king_viewed_index=state_data["king_viewed_index"],
            turn_transition_timer_id=state_data["turn_transition_timer_id"],
            setup_timer_id=state_data["setup_timer_id"],
            cabo_caller=state_data["cabo_caller"],
            final_round_started=state_data["final_round_started"],
            winner=state_data["winner"],
            temporarily_viewed_cards=viewed_cards
        )
        
        # Restore pending timeouts
        game.pending_timeouts = game_data["pending_timeouts"]
        
        # Initialize message queue if not present
        if not hasattr(game, 'message_queue') or game.message_queue is None:
            from queue import Queue
            game.message_queue = Queue()
        
        return game, game_data["room_code"]

    @staticmethod
    async def save_game_checkpoint(
        db: AsyncSession, 
        room_id: str, 
        game: CaboGame, 
        room_code: str,
        sequence_number: int
    ) -> GameCheckpoint:
        """Save game state to database"""
        try:
            game_state = GamePersistence.serialize_game_state(game, room_code, sequence_number)
            
            # Check if checkpoint already exists for this room
            result = await db.execute(
                select(GameCheckpoint).where(GameCheckpoint.room_id == room_id)
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                # Update existing checkpoint
                existing.game_state = game_state
                existing.sequence_number = sequence_number
                existing.updated_at = datetime.utcnow()
                existing.is_active = True
                checkpoint = existing
            else:
                # Create new checkpoint
                checkpoint = GameCheckpoint(
                    room_id=room_id,
                    game_state=game_state,
                    sequence_number=sequence_number
                )
                db.add(checkpoint)
            
            await db.commit()
            logger.info(f"Saved game checkpoint for room {room_id} at sequence {sequence_number}")
            return checkpoint
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Error saving game checkpoint for room {room_id}: {e}")
            raise

    @staticmethod
    async def load_game_checkpoint(db: AsyncSession, room_id: str) -> Optional[tuple[CaboGame, str, int]]:
        """Load game state from database"""
        try:
            result = await db.execute(
                select(GameCheckpoint)
                .where(GameCheckpoint.room_id == room_id)
                .where(GameCheckpoint.is_active == True)
            )
            checkpoint = result.scalar_one_or_none()
            
            if not checkpoint:
                logger.info(f"No active checkpoint found for room {room_id}")
                return None
            
            game_data = checkpoint.game_state
            game, room_code = GamePersistence.deserialize_game_state(game_data)
            
            logger.info(f"Loaded game checkpoint for room {room_id} at sequence {checkpoint.sequence_number}")
            return game, room_code, checkpoint.sequence_number
            
        except Exception as e:
            logger.error(f"Error loading game checkpoint for room {room_id}: {e}")
            return None

    @staticmethod
    async def get_all_active_checkpoints(db: AsyncSession) -> List[tuple[str, CaboGame, str, int]]:
        """Load all active game checkpoints for server startup"""
        try:
            result = await db.execute(
                select(GameCheckpoint)
                .where(GameCheckpoint.is_active == True)
            )
            checkpoints = result.scalars().all()
            
            restored_games = []
            for checkpoint in checkpoints:
                try:
                    game_data = checkpoint.game_state
                    game, room_code = GamePersistence.deserialize_game_state(game_data)
                    restored_games.append((str(checkpoint.room_id), game, room_code, checkpoint.sequence_number))
                    logger.info(f"Restored game for room {checkpoint.room_id}")
                except Exception as e:
                    logger.error(f"Error restoring game for room {checkpoint.room_id}: {e}")
                    # Mark this checkpoint as inactive since it's corrupted
                    checkpoint.is_active = False
            
            await db.commit()
            logger.info(f"Restored {len(restored_games)} active games from database")
            return restored_games
            
        except Exception as e:
            logger.error(f"Error loading active checkpoints: {e}")
            return []

    @staticmethod
    async def deactivate_checkpoint(db: AsyncSession, room_id: str):
        """Mark game checkpoint as inactive when game ends"""
        try:
            result = await db.execute(
                select(GameCheckpoint).where(GameCheckpoint.room_id == room_id)
            )
            checkpoint = result.scalar_one_or_none()
            
            if checkpoint:
                checkpoint.is_active = False
                await db.commit()
                logger.info(f"Deactivated checkpoint for room {room_id}")
                
        except Exception as e:
            await db.rollback()
            logger.error(f"Error deactivating checkpoint for room {room_id}: {e}")

    @staticmethod
    async def cleanup_old_checkpoints(db: AsyncSession, days_old: int = 7):
        """Clean up old inactive checkpoints"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days_old)
            await db.execute(
                delete(GameCheckpoint)
                .where(GameCheckpoint.is_active == False)
                .where(GameCheckpoint.updated_at < cutoff_date)
            )
            await db.commit()
            logger.info(f"Cleaned up checkpoints older than {days_old} days")
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Error cleaning up old checkpoints: {e}")