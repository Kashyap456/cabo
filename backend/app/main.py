from fastapi import FastAPI, HTTPException
from app.core.database import check_database_connection
from app.routers import session
from app.middleware.session import SessionMiddleware

app = FastAPI()

# Add middleware
app.add_middleware(SessionMiddleware, refresh_threshold_days=7, ttl_days=180)

# Include routers
app.include_router(session.router)

@app.get("/health-check")
async def health_check():
    """Health check endpoint with database connectivity verification"""
    db_healthy = await check_database_connection()
    
    if not db_healthy:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    return {}
