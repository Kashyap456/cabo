#!/usr/bin/env python3
"""Test script to debug drawn card not clearing between turns"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.game_manager import (
    CaboGame, 
    DrawCardMessage, 
    ReplaceAndPlayMessage,
    ViewOpponentCardMessage,
    Card, Rank, Suit
)
import time

def test_drawn_card_clearing():
    """Test that drawn card is properly cleared between turns"""
    
    # Create a game with 2 players
    player_ids = ["player1", "player2"]
    player_names = ["Alice", "Bob"]
    
    def broadcast_callback(event):
        print(f"EVENT: {event.event_type} - {event.data}")
    
    def checkpoint_callback():
        print("CHECKPOINT triggered")
    
    game = CaboGame(player_ids, player_names, broadcast_callback, checkpoint_callback)
    
    # Wait for setup to complete
    print("\n=== SETUP PHASE ===")
    print("Waiting for setup timeout (10 seconds)...")
    
    # Process messages until we reach PLAYING phase
    start_time = time.time()
    while time.time() - start_time < 15:  # Max 15 seconds
        events = game.process_messages()
        if events:
            print(f"Processed {len(events)} events")
            for event in events:
                print(f"  - {event.event_type}")
        
        # Check if we're in PLAYING phase
        if game.state.phase.value == "playing":
            print(f"Game phase is now: {game.state.phase.value}")
            break
            
        time.sleep(1.0)  # Check every second
    
    print(f"\n=== TURN 1 - Current player: {game.get_current_player().name} ===")
    print(f"Drawn card before draw: {game.state.drawn_card}")
    
    # Player 1 draws a card
    current_player_id = game.get_current_player().player_id
    game.add_message(DrawCardMessage(player_id=current_player_id))
    events = game.process_messages()
    print(f"After draw - Drawn card: {game.state.drawn_card}")
    
    # Player 1 replaces and plays a card 
    # Set the player's first card to be a 9 (special card) to trigger special action
    game.players[0].hand[0] = Card(Rank.NINE, Suit.HEARTS)
    print(f"Set player's first card to: {game.players[0].hand[0]} (special card)")
    
    # Replace and play - this will play the 9 and trigger special action
    game.add_message(ReplaceAndPlayMessage(player_id=current_player_id, hand_index=0))
    events = game.process_messages()
    print(f"After replace_and_play - Phase: {game.state.phase.value}, Drawn card: {game.state.drawn_card}")
    
    # Check what card was played
    played_card = game.discard_pile[-1] if game.discard_pile else None
    print(f"Played card: {played_card}, is_special: {played_card.is_special if played_card else 'N/A'}")
    
    if game.state.phase.value == "waiting_for_special_action":
        print("\n=== SPECIAL ACTION PHASE ===")
        # If it's a 9/10, do view opponent
        if played_card and played_card.rank in [Rank.NINE, Rank.TEN]:
            print("Executing view opponent card action...")
            other_player_id = player_ids[1] if current_player_id == player_ids[0] else player_ids[0]
            game.add_message(ViewOpponentCardMessage(
                player_id=current_player_id,
                target_player_id=other_player_id,
                card_index=0
            ))
            events = game.process_messages()
            print(f"After special action - Phase: {game.state.phase.value}, Drawn card: {game.state.drawn_card}")
    
    # Process turn transition
    print("\n=== PROCESSING TURN TRANSITION ===")
    print(f"Phase before processing: {game.state.phase.value}")
    print(f"Drawn card before processing: {game.state.drawn_card}")
    
    # Process messages multiple times to handle timeouts
    for i in range(10):
        events = game.process_messages()
        if events:
            print(f"Iteration {i}: Processed {len(events)} events")
            for event in events:
                print(f"  - {event.event_type}")
        time.sleep(0.6)  # Wait for timeout to trigger
        
        # Check if turn changed
        if game.state.phase.value == "playing" and game.get_current_player().player_id != current_player_id:
            print(f"Turn changed to: {game.get_current_player().name}")
            break
    
    print(f"\n=== TURN 2 - Current player: {game.get_current_player().name} ===")
    print(f"Phase: {game.state.phase.value}")
    print(f"Drawn card: {game.state.drawn_card}")
    
    # Try to draw as player 2
    new_current_player_id = game.get_current_player().player_id
    print(f"\nAttempting to draw as {game.get_current_player().name}...")
    game.add_message(DrawCardMessage(player_id=new_current_player_id))
    events = game.process_messages()
    
    print(f"Draw result - Drawn card: {game.state.drawn_card}")
    if not events:
        print("ERROR: No events generated - draw likely failed!")
    else:
        print(f"Success: Generated {len(events)} events")

if __name__ == "__main__":
    test_drawn_card_clearing()