# Game Room Management Implementation Plan

## Architecture Overview

The system separates room management (HTTP) from game mechanics (WebSocket):
- **HTTP endpoints** handle room lifecycle: create, join, leave, configure, start
- **WebSocket connections** established when players join rooms (before game starts)
- **Message queue** per room processes player actions sequentially to maintain game state consistency
- **Rooms are supersets of games** - a room exists before, during, and after a game

## Core Components

### 1. Room Manager (`services/room_manager.py`)

**Data Structures:**
```python
@dataclass
class RoomConfig:
    max_players: int = 6
    min_players: int = 2
    timeout_seconds: int = 600  # Room expires after 10 minutes of inactivity
    allow_spectators: bool = False

@dataclass
class GameRoom:
    room_id: str  # UUID - also serves as game_id when game is active
    room_code: str  # 6-digit alphanumeric
    config: RoomConfig
    state: RoomState  # WAITING, IN_GAME, FINISHED
    host_session_id: str
    created_at: float
    last_activity: float
    game_started_at: Optional[float] = None
```

**Key Methods:**
- `generate_room_code()` - Creates unique 6-digit alphanumeric codes
- `create_room(host_session_id, config)` - Creates new room with host
- `join_room(room_code, session_id)` - Player joins existing room
- `leave_room(room_code, session_id)` - Player leaves, host migration if needed
- `start_game(room_code, session_id)` - Host starts game, creates CaboGame
- `get_room(room_code)` - Retrieves room info
- `get_room_players(room_id)` - Gets all sessions in a room
- `cleanup_expired_rooms()` - Background task to remove inactive rooms

### 2. Game Orchestrator (`services/game_orchestrator.py`)
**New file to manage multiple games and message dispatch**

```python
class GameOrchestrator:
    def __init__(self):
        self.active_games: Dict[str, CaboGame] = {}  # room_id -> CaboGame
        self.game_queues: Dict[str, asyncio.Queue] = {}  # room_id -> Queue
        self.game_tasks: Dict[str, asyncio.Task] = {}  # room_id -> Task
        self.connection_manager: ConnectionManager = ConnectionManager()
    
    async def create_game(self, room: GameRoom, players: List[UserSession]) -> None:
        """Creates new CaboGame instance from room data"""
        # 1. Create CaboGame with broadcast callback
        # 2. Create message queue for this game
        # 3. Start game processing loop task
        
    async def process_game_loop(self, room_id: str):
        """Main game loop - processes messages from queue"""
        # 1. Get game and queue
        # 2. Process messages in order
        # 3. Broadcast events via connection_manager
        # 4. Handle game end and cleanup
        
    async def handle_player_message(self, room_id: str, session_id: str, message: dict):
        """Converts WS message to game message and queues it"""
        # 1. Validate player is in game
        # 2. Convert to appropriate GameMessage type
        # 3. Add to game's queue
        
    async def end_game(self, room_id: str):
        """Clean up game resources"""
        # 1. Cancel processing task
        # 2. Remove from active games
        # 3. Clean up queue
```

### 3. Connection Manager (`services/connection_manager.py`)
**Manages WebSocket connections for all rooms**

```python
class ConnectionManager:
    def __init__(self):
        self.connections: Dict[str, Dict[str, WebSocket]] = {}  # {room_id: {session_id: WebSocket}}
        self.session_to_room: Dict[str, str] = {}  # session_id -> room_id (for quick lookups)
    
    async def add_to_room(self, session_id: str, room_id: str, websocket: WebSocket):
        """Add session WebSocket to room"""
        if room_id not in self.connections:
            self.connections[room_id] = {}
        self.connections[room_id][session_id] = websocket
        self.session_to_room[session_id] = room_id
        
    async def remove_from_room(self, session_id: str):
        """Remove session from its room"""
        if session_id in self.session_to_room:
            room_id = self.session_to_room[session_id]
            if room_id in self.connections:
                self.connections[room_id].pop(session_id, None)
                if not self.connections[room_id]:  # Clean up empty rooms
                    del self.connections[room_id]
            del self.session_to_room[session_id]
        
    async def send_to_session(self, session_id: str, message: dict):
        """Send message to specific session"""
        room_id = self.session_to_room.get(session_id)
        if room_id and room_id in self.connections:
            websocket = self.connections[room_id].get(session_id)
            if websocket:
                await websocket.send_json(message)
        
    async def broadcast_to_room(self, room_id: str, message: dict):
        """Broadcast to all sessions in a room"""
        if room_id in self.connections:
            for session_id, websocket in self.connections[room_id].items():
                await websocket.send_json(message)
    
    def get_room_sessions(self, room_id: str) -> List[str]:
        """Get all session IDs in a room"""
        return list(self.connections.get(room_id, {}).keys())
```

### 4. Database Models Enhancement

```python
# Update UserSession model (app/models/session.py)
class UserSession(Base):
    __tablename__ = "user_sessions"
    
    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    username = Column(String, nullable=False)
    room_id = Column(UUID, ForeignKey("game_rooms.room_id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active = Column(DateTime, default=datetime.utcnow)
    
    # Relationship
    room = relationship("GameRoom", back_populates="sessions")

# New GameRoom model (app/models/room.py)
class GameRoom(Base):
    __tablename__ = "game_rooms"
    
    room_id = Column(UUID, primary_key=True, default=uuid.uuid4)
    room_code = Column(String(6), unique=True, index=True, nullable=False)
    config = Column(JSON, nullable=False)
    state = Column(Enum(RoomState), default=RoomState.WAITING)
    host_session_id = Column(UUID, ForeignKey("user_sessions.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    last_activity = Column(DateTime, default=datetime.utcnow)
    game_started_at = Column(DateTime, nullable=True)
    
    # Relationships
    sessions = relationship("UserSession", back_populates="room")
    host = relationship("UserSession", foreign_keys=[host_session_id])
```

### 5. HTTP Endpoints (`app/routers/game.py`)

```python
# Room Management Endpoints
POST   /api/rooms/create
       Body: {config: {max_players: 6}}
       Response: {room_code: "ABC123", room_id: "uuid"}

POST   /api/rooms/{room_code}/join
       Response: {success: true, room: {...}}

POST   /api/rooms/{room_code}/leave
       Response: {success: true}

GET    /api/rooms/{room_code}
       Response: {room: {...}, players: [...]}

POST   /api/rooms/{room_code}/start
       Response: {success: true}

PATCH  /api/rooms/{room_code}/config
       Body: {max_players: 4}
       Response: {success: true}
```

### 6. WebSocket Enhancement (`app/routers/ws.py`)

```python
@ws_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    # 1. Authenticate via session cookie/header
    session = await authenticate_websocket(websocket, db)
    if not session:
        await websocket.close(code=4001, reason="Unauthorized")
        return
    
    # 2. Accept connection
    await websocket.accept()
    
    # 3. If session has room_id, add to room connections
    if session.room_id:
        await connection_manager.add_to_room(session.id, session.room_id, websocket)
        await send_room_state(session.id, session.room_id)
    
    try:
        while True:
            # 4. Receive and route messages
            data = await websocket.receive_json()
            
            if session.room_id:
                # Route game messages to orchestrator
                await game_orchestrator.handle_player_message(
                    session.room_id, session.id, data
                )
            else:
                # Handle lobby/non-game messages
                await handle_lobby_message(session.id, data)
                
    except WebSocketDisconnect:
        await connection_manager.remove_from_room(session.id)
```

## Message Flow

### Room Creation & Joining
1. Client calls `POST /api/rooms/create`
2. Server creates room with unique 6-digit code
3. UserSession.room_id updated to new room
4. Client establishes WebSocket connection
5. Server adds session to room's connection set
6. Other players join via `POST /api/rooms/{code}/join`
7. Their sessions updated and WebSocket connections added to room

### Game Start
1. Host calls `POST /api/rooms/{code}/start`
2. Room state changes to IN_GAME
3. GameOrchestrator creates CaboGame instance using room_id as game identifier
4. Game processing loop starts
5. Initial game state broadcast to all connected players
6. Players see setup phase (initial cards visible for 10 seconds)

### Game Message Processing
```
Client WS Message → WebSocket Handler → GameOrchestrator → Message Queue → CaboGame.process_messages() → Broadcast Events
```

Example flow:
1. Player sends: `{type: "draw_card"}`
2. WebSocket handler validates session has room_id
3. GameOrchestrator converts to `DrawCardMessage` with player_id from session
4. Message added to room's queue
5. Game loop processes message
6. CaboGame triggers broadcast callback
7. ConnectionManager broadcasts to all sessions in room

### Room/Game Cleanup
1. When game ends, CaboGame sets phase to ENDED
2. GameOrchestrator detects end, cleans up game instance
3. Room state changes to FINISHED
4. Players remain connected, can start new game or leave
5. If all players leave, room is marked for cleanup

## Implementation Steps

### Phase 1: Database & Models
1. Add room_id foreign key to UserSession
2. Create GameRoom table and model
3. Add Alembic migration
4. Update session management to track room association

### Phase 2: Room Management
1. Implement RoomManager service
2. Create HTTP endpoints for room operations
3. Add room code generation with collision detection
4. Implement join/leave with host migration

### Phase 3: WebSocket Foundation
1. Implement ConnectionManager service
2. Update WebSocket endpoint with authentication
3. Add room-based connection tracking
4. Implement reconnection handling

### Phase 4: Game Orchestrator
1. Create GameOrchestrator service
2. Implement game creation from room
3. Add message queue and processing loop
4. Connect to CaboGame with broadcast callbacks

### Phase 5: Integration & Polish
1. Connect all components
2. Add proper error handling
3. Implement room cleanup
4. Add logging and monitoring

## Key Design Decisions

1. **Unified Room/Game ID**: Room_id serves as the game identifier, simplifying the mental model
2. **Early WebSocket Connection**: Players connect when joining room, ensuring they're ready for game start
3. **Session-Based Room Association**: UserSession.room_id provides clear ownership and simplifies queries
4. **Separated Orchestration**: GameOrchestrator handles multi-game management, while game_manager.py focuses on single game logic

## Security Considerations

1. **WebSocket Authentication**: Validate session on connection
2. **Room Permissions**: Only host can start/configure game
3. **Message Validation**: Validate all game messages
4. **Rate Limiting**: Prevent message flooding
5. **Room Code Security**: Use cryptographically secure random generation

## Error Handling

1. **Connection Loss**: Maintain game state, allow reconnection
2. **Host Disconnect**: Automatic host migration to next player
3. **Invalid Messages**: Log and ignore, notify client
4. **Game Errors**: Graceful degradation, room remains usable
5. **Cleanup**: Ensure resources freed properly

## Testing Strategy

1. **Unit Tests**: Each service in isolation
2. **Integration Tests**: Room lifecycle with database
3. **WebSocket Tests**: Connection management and message routing
4. **End-to-End Tests**: Complete game flow from room creation to game end
5. **Load Tests**: Multiple concurrent rooms/games

## Migration Script

```sql
-- Add room_id to user_sessions
ALTER TABLE user_sessions 
ADD COLUMN room_id UUID REFERENCES game_rooms(room_id);

-- Create game_rooms table
CREATE TABLE game_rooms (
    room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(6) UNIQUE NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    state VARCHAR(20) NOT NULL DEFAULT 'WAITING',
    host_session_id UUID REFERENCES user_sessions(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    game_started_at TIMESTAMP
);

-- Add index for room lookups
CREATE INDEX idx_room_code ON game_rooms(room_code);
CREATE INDEX idx_room_state ON game_rooms(state);
```

## Timeline Estimate

- Phase 1: 2 hours (Database & Models)
- Phase 2: 3 hours (Room Management)
- Phase 3: 3 hours (WebSocket Foundation)  
- Phase 4: 4 hours (Game Orchestrator)
- Phase 5: 3 hours (Integration & Polish)

Total: 15 hours for full implementation