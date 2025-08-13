from fastapi import FastAPI, HTTPException
from app.core.database import check_database_connection

app = FastAPI()

@app.get("/health-check")
async def health_check():
    """Health check endpoint with database connectivity verification"""
    db_healthy = await check_database_connection()
    
    if not db_healthy:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    return {}
