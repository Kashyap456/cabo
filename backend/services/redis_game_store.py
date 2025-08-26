import logging
from typing import Dict, Any, Optional, List, Tuple
from services.redis_manager import redis_manager
from services.game_manager import CaboGame, Card, Rank, Suit, Player, GameState, GamePhase, GameEvent
from collections import defaultdict
import json

logger = logging.getLogger(__name__)


class RedisGameStore:
    """Handles saving and loading game state to/from Redis"""
    
    def __init__(self):
        self.redis = redis_manager
    
    @staticmethod
    def serialize_card(card: Optional[Card]) -> Optional[Dict[str, Any]]:
        """Serialize a Card object"""
        if not card:
            return None
        return {
            "rank": card.rank.value,
            "suit": card.suit.value if card.suit else None
        }
    
    @staticmethod
    def deserialize_card(card_data: Optional[Dict[str, Any]]) -> Optional[Card]:
        """Deserialize a Card object"""
        if not card_data or card_data == 'None':
            return None
        rank = Rank(card_data["rank"])
        suit = Suit(card_data["suit"]) if card_data.get("suit") else None
        return Card(rank, suit)
    
    async def save_game(self, room_id: str, game: CaboGame, room_code: str) -> None:
        """Save complete game state to Redis"""
        try:
            async with self.redis.lock(f"game:{room_id}", timeout=5):
                # Start a pipeline for atomic updates
                async with self.redis.pipeline() as pipe:
                    # Save metadata
                    meta = {
                        "game_id": game.game_id,
                        "room_code": room_code,
                        "phase": game.state.phase.value,
                        "current_player_index": game.state.current_player_index,
                        "turn_number": getattr(game.state, 'turn_number', 1),
                        "final_round_started": game.state.final_round_started,
                        "winner": game.state.winner or "",
                        "pending_timeouts": json.dumps(game.pending_timeouts)
                    }
                    await pipe.hset(f"game:{room_id}:meta", mapping={
                        k: str(v) for k, v in meta.items()
                    })
                    await pipe.expire(f"game:{room_id}:meta", 86400)
                    
                    # Save players
                    for player in game.players:
                        player_data = {
                            "name": player.name,
                            "hand": json.dumps([self.serialize_card(card) for card in player.hand]),
                            "has_called_cabo": str(player.has_called_cabo)
                        }
                        await pipe.hset(f"game:{room_id}:player:{player.player_id}", 
                                      mapping=player_data)
                        await pipe.expire(f"game:{room_id}:player:{player.player_id}", 86400)
                    
                    # Save deck
                    await pipe.delete(f"game:{room_id}:deck")
                    for card in game.deck.cards:
                        await pipe.rpush(f"game:{room_id}:deck", 
                                       json.dumps(self.serialize_card(card)))
                    await pipe.expire(f"game:{room_id}:deck", 86400)
                    
                    # Save discard pile
                    await pipe.delete(f"game:{room_id}:discard")
                    for card in game.discard_pile:
                        await pipe.rpush(f"game:{room_id}:discard", 
                                       json.dumps(self.serialize_card(card)))
                    await pipe.expire(f"game:{room_id}:discard", 86400)
                    
                    # Save turn state
                    turn_data = {
                        "drawn_card": json.dumps(self.serialize_card(game.state.drawn_card)),
                        "played_card": json.dumps(self.serialize_card(game.state.played_card)),
                        "stack_caller": game.state.stack_caller or "",
                        "stack_timer_id": game.state.stack_timer_id or "",
                        "special_action_player": game.state.special_action_player or "",
                        "special_action_type": game.state.special_action_type or "",
                        "special_action_timer_id": game.state.special_action_timer_id or "",
                        "king_viewed_card": json.dumps(self.serialize_card(game.state.king_viewed_card)),
                        "king_viewed_player": game.state.king_viewed_player or "",
                        "king_viewed_index": str(game.state.king_viewed_index) if game.state.king_viewed_index is not None else "",
                        "turn_transition_timer_id": game.state.turn_transition_timer_id or "",
                        "setup_timer_id": game.state.setup_timer_id or "",
                        "cabo_caller": game.state.cabo_caller or ""
                    }
                    # Remove empty values
                    turn_data = {k: v for k, v in turn_data.items() if v and v != '""' and v != 'null'}
                    if turn_data:
                        await pipe.hset(f"game:{room_id}:turn", mapping=turn_data)
                        await pipe.expire(f"game:{room_id}:turn", 86400)
                    
                    # Save card visibility
                    for viewer_id, visible_cards in game.state.card_visibility.items():
                        await pipe.delete(f"game:{room_id}:viewed:{viewer_id}")
                        for target_id, card_index in visible_cards:
                            await pipe.sadd(f"game:{room_id}:viewed:{viewer_id}", 
                                          f"{target_id}:{card_index}")
                        await pipe.expire(f"game:{room_id}:viewed:{viewer_id}", 86400)
                    
                    # Execute pipeline
                    await pipe.execute()
                    
                logger.debug(f"Saved game state for room {room_id}")
                
        except Exception as e:
            logger.error(f"Error saving game state for room {room_id}: {e}")
            raise
    
    async def load_game(self, room_id: str) -> Optional[Tuple[CaboGame, str]]:
        """Load game state from Redis"""
        try:
            # Check if game exists
            if not await self.redis.is_game_active(room_id):
                return None
            
            # Load metadata
            meta = await self.redis.get_game_meta(room_id)
            if not meta:
                return None
            
            room_code = meta.get('room_code', '')
            
            # Load players
            players_data = await self.redis.get_all_players(room_id)
            if not players_data:
                return None
            
            # Create game with players
            player_ids = [p['player_id'] for p in players_data]
            player_names = [p['name'] for p in players_data]
            
            game = CaboGame(player_ids, player_names)
            
            # Restore game ID
            game.game_id = meta.get('game_id', game.game_id)
            
            # Restore player hands and state
            for i, player_data in enumerate(players_data):
                player = game.players[i]
                hand_data = player_data.get('hand', [])
                player.hand = [self.deserialize_card(card) for card in hand_data]
                player.has_called_cabo = player_data.get('has_called_cabo', False)
            
            # Restore deck
            deck_data = await self.redis.get_deck(room_id)
            game.deck.cards = [self.deserialize_card(card) for card in deck_data]
            
            # Restore discard pile
            discard_data = await self.redis.get_discard_pile(room_id)
            game.discard_pile = [self.deserialize_card(card) for card in discard_data]
            
            # Restore game state
            game.state.phase = GamePhase(meta.get('phase', 'SETUP'))
            game.state.current_player_index = int(meta.get('current_player_index', 0))
            game.state.turn_number = int(meta.get('turn_number', 1))
            game.state.final_round_started = meta.get('final_round_started', 'False') == 'True'
            game.state.winner = meta.get('winner') if meta.get('winner') else None
            
            # Restore turn state
            turn_data = await self.redis.get_turn_state(room_id)
            if turn_data:
                game.state.drawn_card = self.deserialize_card(turn_data.get('drawn_card'))
                game.state.played_card = self.deserialize_card(turn_data.get('played_card'))
                game.state.stack_caller = turn_data.get('stack_caller') or None
                game.state.stack_timer_id = turn_data.get('stack_timer_id') or None
                game.state.special_action_player = turn_data.get('special_action_player') or None
                game.state.special_action_type = turn_data.get('special_action_type') or None
                game.state.special_action_timer_id = turn_data.get('special_action_timer_id') or None
                game.state.king_viewed_card = self.deserialize_card(turn_data.get('king_viewed_card'))
                game.state.king_viewed_player = turn_data.get('king_viewed_player') or None
                game.state.king_viewed_index = int(turn_data['king_viewed_index']) if turn_data.get('king_viewed_index') and turn_data['king_viewed_index'].isdigit() else None
                game.state.turn_transition_timer_id = turn_data.get('turn_transition_timer_id') or None
                game.state.setup_timer_id = turn_data.get('setup_timer_id') or None
                game.state.cabo_caller = turn_data.get('cabo_caller') or None
            
            # Restore card visibility
            game.state.card_visibility = defaultdict(list)
            for player_id in player_ids:
                viewed_cards = await self.redis.get_viewed_cards(room_id, player_id)
                if viewed_cards:
                    # Convert set of "target_id:card_index" strings to list of tuples
                    for card_str in viewed_cards:
                        # card_str might be bytes or string from Redis
                        if isinstance(card_str, bytes):
                            card_str = card_str.decode('utf-8')
                        if ':' in card_str:
                            target_id, card_index = card_str.split(':')
                            game.state.card_visibility[player_id].append((target_id, int(card_index)))
                        else:
                            logger.warning(f"Invalid card visibility format: {card_str}")
            
            # Restore pending timeouts
            if 'pending_timeouts' in meta:
                try:
                    # Check if it's already a dict or needs JSON parsing
                    pt = meta['pending_timeouts']
                    if isinstance(pt, str):
                        game.pending_timeouts = json.loads(pt)
                    elif isinstance(pt, dict):
                        game.pending_timeouts = pt
                    else:
                        game.pending_timeouts = {}
                except Exception as e:
                    logger.warning(f"Failed to parse pending_timeouts: {e}")
                    game.pending_timeouts = {}
            else:
                game.pending_timeouts = {}
            return game, room_code
            
        except Exception as e:
            logger.error(f"Error loading game state for room {room_id}: {e}")
            return None
    
    async def atomic_draw_card(self, room_id: str) -> Optional[Card]:
        """Atomically draw a card from the deck"""
        card_data = await self.redis.draw_card(room_id)
        return self.deserialize_card(card_data) if card_data else None
    
    async def update_turn_state(self, room_id: str, **kwargs) -> None:
        """Update specific turn state fields"""
        turn_data = {}
        
        for key, value in kwargs.items():
            if value is None:
                continue
            elif isinstance(value, Card):
                turn_data[key] = json.dumps(self.serialize_card(value))
            elif isinstance(value, (dict, list)):
                turn_data[key] = json.dumps(value)
            else:
                turn_data[key] = str(value)
        
        if turn_data:
            await self.redis.save_turn_state(room_id, turn_data)
    
    async def get_game_phase(self, room_id: str) -> Optional[str]:
        """Quick check of game phase without loading full game"""
        meta = await self.redis.get_game_meta(room_id)
        return meta.get('phase') if meta else None
    
    async def is_game_ended(self, room_id: str) -> bool:
        """Check if game has ended"""
        phase = await self.get_game_phase(room_id)
        return phase == 'ENDED' if phase else True
    
    async def list_active_games(self) -> List[Dict[str, Any]]:
        """List all active games with basic info"""
        room_ids = await self.redis.get_active_games()
        
        games = []
        for room_id in room_ids:
            meta = await self.redis.get_game_meta(room_id)
            if meta and meta.get('phase') != 'ENDED':
                games.append({
                    'room_id': room_id,
                    'room_code': meta.get('room_code', ''),
                    'phase': meta.get('phase', ''),
                    'game_id': meta.get('game_id', '')
                })
        
        return games


# Global instance
redis_game_store = RedisGameStore()