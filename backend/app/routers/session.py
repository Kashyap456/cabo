import uuid
from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, Cookie
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.session import UserSession
from services.session_manager import SessionManager


router = APIRouter(prefix="/sessions", tags=["sessions"])


class CreateSessionRequest(BaseModel):
    nickname: str


class UpdateNicknameRequest(BaseModel):
    nickname: str


class SessionResponse(BaseModel):
    user_id: str
    nickname: str
    token: str
    expires_at: str
    created_at: str
    
    class Config:
        from_attributes = True


async def get_session_manager(db: AsyncSession = Depends(get_db)) -> SessionManager:
    """Dependency to get session manager instance"""
    return SessionManager(db)


async def get_current_session(
    session_token: Optional[str] = Cookie(None),
    session_manager: SessionManager = Depends(get_session_manager)
) -> Optional[UserSession]:
    """Dependency to get current session from cookie"""
    if not session_token:
        return None
    
    try:
        token_uuid = uuid.UUID(session_token)
        session = await session_manager.validate_session(token_uuid)
        return session
    except (ValueError, TypeError):
        return None


@router.post("/", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    response: Response,
    session_manager: SessionManager = Depends(get_session_manager)
):
    """
    Create a new session for a user with the given nickname.
    Sets a session cookie and returns session details.
    """
    if not request.nickname or len(request.nickname.strip()) == 0:
        raise HTTPException(status_code=400, detail="Nickname cannot be empty")
    
    if len(request.nickname) > 100:
        raise HTTPException(status_code=400, detail="Nickname too long (max 100 characters)")
    
    # Create new session
    session = await session_manager.create_session(request.nickname.strip())
    
    # Set secure HTTP-only cookie
    response.set_cookie(
        key="session_token",
        value=str(session.token),
        max_age=int(timedelta(days=180).total_seconds()),
        httponly=True,
        secure=False,  # Set to True in production with HTTPS
        samesite="lax"
    )
    
    return SessionResponse(
        user_id=str(session.user_id),
        nickname=session.nickname,
        token=str(session.token),
        expires_at=session.expires_at.isoformat(),
        created_at=session.created_at.isoformat()
    )


@router.get("/validate", response_model=SessionResponse)
async def validate_session(
    current_session: UserSession = Depends(get_current_session)
):
    """
    Validate the current session from cookie.
    Returns session details if valid.
    """
    if not current_session:
        raise HTTPException(status_code=401, detail="Invalid or missing session")
    
    return SessionResponse(
        user_id=str(current_session.user_id),
        nickname=current_session.nickname,
        token=str(current_session.token),
        expires_at=current_session.expires_at.isoformat(),
        created_at=current_session.created_at.isoformat()
    )


@router.put("/nickname", response_model=SessionResponse)
async def update_nickname(
    request: UpdateNicknameRequest,
    current_session: UserSession = Depends(get_current_session),
    session_manager: SessionManager = Depends(get_session_manager)
):
    """
    Update the nickname for the current session without invalidating it.
    """
    if not current_session:
        raise HTTPException(status_code=401, detail="Invalid or missing session")
    
    if not request.nickname or len(request.nickname.strip()) == 0:
        raise HTTPException(status_code=400, detail="Nickname cannot be empty")
    
    if len(request.nickname) > 100:
        raise HTTPException(status_code=400, detail="Nickname too long (max 100 characters)")
    
    # Update nickname
    updated_session = await session_manager.update_nickname(
        current_session.user_id, 
        request.nickname.strip()
    )
    
    if not updated_session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return SessionResponse(
        user_id=str(updated_session.user_id),
        nickname=updated_session.nickname,
        token=str(updated_session.token),
        expires_at=updated_session.expires_at.isoformat(),
        created_at=updated_session.created_at.isoformat()
    )


@router.delete("/")
async def logout(
    response: Response,
    current_session: UserSession = Depends(get_current_session),
    session_manager: SessionManager = Depends(get_session_manager)
):
    """
    Logout by invalidating the current session and clearing the cookie.
    """
    if current_session:
        await session_manager.invalidate_session(current_session.token)
    
    # Clear the session cookie
    response.delete_cookie(key="session_token", samesite="lax")
    
    return {"message": "Logged out successfully"}


@router.post("/refresh", response_model=SessionResponse)
async def refresh_session(
    response: Response,
    current_session: UserSession = Depends(get_current_session),
    session_manager: SessionManager = Depends(get_session_manager)
):
    """
    Manually refresh the current session token and extend expiration.
    """
    if not current_session:
        raise HTTPException(status_code=401, detail="Invalid or missing session")
    
    # Refresh the session token
    refreshed_session = await session_manager.refresh_session_token(current_session.user_id)
    
    if not refreshed_session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Update the cookie with new token
    response.set_cookie(
        key="session_token",
        value=str(refreshed_session.token),
        max_age=int(timedelta(days=180).total_seconds()),
        httponly=True,
        secure=False,  # Set to True in production with HTTPS
        samesite="lax"
    )
    
    return SessionResponse(
        user_id=str(refreshed_session.user_id),
        nickname=refreshed_session.nickname,
        token=str(refreshed_session.token),
        expires_at=refreshed_session.expires_at.isoformat(),
        created_at=refreshed_session.created_at.isoformat()
    )