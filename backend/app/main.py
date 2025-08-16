from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import check_database_connection
from app.routers.game import game_router
from app.routers.ws import ws_router

app = FastAPI(title="Cabo Game API", description="API for managing Cabo card game instances")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(game_router, prefix="/api/game", tags=["game"])
app.include_router(ws_router, prefix="/api", tags=["websocket"])

@app.get("/health-check")
async def health_check():
    """Health check endpoint with database connectivity verification"""
    db_healthy = await check_database_connection()
    
    if not db_healthy:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    return {"status": "healthy", "database": "connected"}
