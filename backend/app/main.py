from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import check_database_connection
from app.routers import session, game, ws
from app.middleware.session import SessionMiddleware
from services.connection_manager import ConnectionManager
from services.game_orchestrator import GameOrchestrator

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000",
                   "http://127.0.0.1:3000",],  # Frontend development server
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

# Initialize shared services
connection_manager = ConnectionManager()
game_orchestrator = GameOrchestrator(connection_manager)

# Set up dependencies in routers
game.set_connection_manager(connection_manager)
game.set_game_orchestrator(game_orchestrator)
ws.set_game_orchestrator(game_orchestrator)

# Add middleware
app.add_middleware(SessionMiddleware, refresh_threshold_days=7, ttl_days=180)

# Include routers
app.include_router(session.router)
app.include_router(game.router)
app.include_router(ws.ws_router)


@app.get("/health-check")
async def health_check():
    """Health check endpoint with database connectivity verification"""
    db_healthy = await check_database_connection()

    if not db_healthy:
        raise HTTPException(
            status_code=500, detail="Database connection failed")

    return {}
