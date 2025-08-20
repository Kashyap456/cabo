from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import check_database_connection
from app.routers import session, game, ws
from app.middleware.session import SessionMiddleware
from services.connection_manager import ConnectionManager
from services.game_orchestrator import GameOrchestrator
from services.redis_manager import redis_manager
import logging
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

# Global variables for shared services
connection_manager = ConnectionManager()
game_orchestrator = None
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - handles startup and shutdown"""
    global game_orchestrator

    # Startup
    try:
        # Connect to Redis
        await redis_manager.connect()
        logger.info("Connected to Redis")
        
        # Restore active games from database
        game_orchestrator = await GameOrchestrator.restore_all_active_games(connection_manager)

        # Set up dependencies in routers
        game.set_connection_manager(connection_manager)
        game.set_game_orchestrator(game_orchestrator)
        ws.set_game_orchestrator(game_orchestrator)
        ws.set_connection_manager(connection_manager)

        logger.info("Application started successfully with restored games")

    except Exception as e:
        logger.error(f"Error during startup: {e}")
        print(f"Error during startup: {e}")
        # Fall back to empty orchestrator if restoration fails
        game_orchestrator = GameOrchestrator(connection_manager)
        game.set_connection_manager(connection_manager)
        game.set_game_orchestrator(game_orchestrator)
        ws.set_game_orchestrator(game_orchestrator)
        ws.set_connection_manager(connection_manager)

    yield

    # Shutdown
    logger.info("Application shutting down")
    await redis_manager.disconnect()

app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000",
                   "http://127.0.0.1:3000",],  # Frontend development server
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

# Add middleware
app.add_middleware(SessionMiddleware, refresh_threshold_days=7, ttl_days=180)

# Include routers
app.include_router(session.router)
app.include_router(game.router)
app.include_router(ws.ws_router)


@app.get("/health-check")
async def health_check():
    """Health check endpoint with database and Redis connectivity verification"""
    db_healthy = await check_database_connection()
    
    # Check Redis connection
    redis_healthy = False
    try:
        await redis_manager.ensure_connected()
        await redis_manager.redis.ping()
        redis_healthy = True
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")

    if not db_healthy:
        raise HTTPException(
            status_code=500, detail="Database connection failed")
    
    if not redis_healthy:
        raise HTTPException(
            status_code=500, detail="Redis connection failed")

    return {"database": "healthy", "redis": "healthy"}
