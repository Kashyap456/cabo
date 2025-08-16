import uuid
from datetime import timedelta
from typing import Optional
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from app.core.database import async_session_maker
from app.models.session import UserSession
from services.session_manager import SessionManager


class SessionMiddleware(BaseHTTPMiddleware):
    """
    Middleware to automatically validate session cookies and inject user context.
    Optionally refreshes tokens when they're close to expiration.
    """
    
    def __init__(
        self, 
        app: ASGIApp, 
        refresh_threshold_days: int = 7,
        ttl_days: int = 180
    ):
        super().__init__(app)
        self.refresh_threshold_days = refresh_threshold_days
        self.ttl_days = ttl_days
    
    async def dispatch(self, request: Request, call_next):
        # Initialize user context
        request.state.user = None
        request.state.session = None
        
        # Get session token from cookie
        session_token = request.cookies.get("session_token")
        
        if session_token:
            try:
                token_uuid = uuid.UUID(session_token)
                
                # Validate and potentially refresh session
                async with async_session_maker() as db_session:
                    session_manager = SessionManager(db_session)
                    user_session = await session_manager.validate_session(
                        token_uuid, 
                        self.refresh_threshold_days
                    )
                    
                    if user_session:
                        # Set user context for the request
                        request.state.user = user_session
                        request.state.session = user_session
                        
                        # Check if token was refreshed (different from original)
                        token_was_refreshed = str(user_session.token) != session_token
                        
                        # Process the request
                        response = await call_next(request)
                        
                        # Update cookie if token was refreshed
                        if token_was_refreshed:
                            response.set_cookie(
                                key="session_token",
                                value=str(user_session.token),
                                max_age=int(timedelta(days=self.ttl_days).total_seconds()),
                                httponly=True,
                                secure=False,  # Set to True in production with HTTPS
                                samesite="lax"
                            )
                        
                        return response
                    
            except (ValueError, TypeError, Exception):
                # Invalid token format or database error
                pass
        
        # No valid session found, continue without user context
        response = await call_next(request)
        return response


def get_current_user(request: Request) -> Optional[UserSession]:
    """
    Helper function to get the current user from request state.
    Can be used in route handlers to access the current session.
    """
    return getattr(request.state, 'user', None)


def get_current_session(request: Request) -> Optional[UserSession]:
    """
    Helper function to get the current session from request state.
    Can be used in route handlers to access the current session.
    """
    return getattr(request.state, 'session', None)


def require_session(request: Request) -> UserSession:
    """
    Helper function that raises an exception if no valid session exists.
    Use this in route handlers that require authentication.
    """
    session = get_current_session(request)
    if not session:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Authentication required")
    return session