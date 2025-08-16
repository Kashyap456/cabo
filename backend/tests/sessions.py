import os
import uuid
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from app.core.database import Base, get_db
from app.main import app
from app.models.session import UserSession
from services.session_manager import SessionManager
from dotenv import load_dotenv

load_dotenv()


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


class TestSessionAPI:
    """Test cases for session API endpoints"""

    def test_create_session_success(self, client):
        """Test successful session creation"""
        response = client.post("/sessions/", json={"nickname": "test_user"})

        assert response.status_code == 200
        data = response.json()

        assert "user_id" in data
        assert data["nickname"] == "test_user"
        assert "token" in data
        assert "expires_at" in data
        assert "created_at" in data

        # Check that session cookie is set
        assert "session_token" in response.cookies

    def test_create_session_empty_nickname(self, client):
        """Test session creation with empty nickname"""
        response = client.post("/sessions/", json={"nickname": ""})

        assert response.status_code == 400
        assert "Nickname cannot be empty" in response.json()["detail"]

    def test_create_session_whitespace_nickname(self, client):
        """Test session creation with whitespace-only nickname"""
        response = client.post("/sessions/", json={"nickname": "   "})

        assert response.status_code == 400
        assert "Nickname cannot be empty" in response.json()["detail"]

    def test_create_session_long_nickname(self, client):
        """Test session creation with too long nickname"""
        long_nickname = "a" * 101  # 101 characters
        response = client.post("/sessions/", json={"nickname": long_nickname})

        assert response.status_code == 400
        assert "Nickname too long" in response.json()["detail"]

    def test_create_session_trims_whitespace(self, client):
        """Test that session creation trims whitespace from nickname"""
        response = client.post(
            "/sessions/", json={"nickname": "  test_user  "})

        assert response.status_code == 200
        data = response.json()
        assert data["nickname"] == "test_user"  # Whitespace should be trimmed

    def test_validate_session_success(self, client):
        """Test successful session validation"""
        # First create a session
        create_response = client.post(
            "/sessions/", json={"nickname": "test_user"})
        assert create_response.status_code == 200

        # Extract session token from cookie
        session_token = create_response.cookies["session_token"]

        # Validate the session using the cookie
        validate_response = client.get(
            "/sessions/validate", cookies={"session_token": session_token})

        assert validate_response.status_code == 200
        data = validate_response.json()

        assert data["nickname"] == "test_user"
        assert "user_id" in data
        assert "token" in data

    def test_validate_session_no_cookie(self, client):
        """Test session validation without cookie"""
        response = client.get("/sessions/validate")

        assert response.status_code == 401
        assert "Invalid or missing session" in response.json()["detail"]

    def test_validate_session_invalid_cookie(self, client):
        """Test session validation with invalid cookie"""
        response = client.get("/sessions/validate",
                              cookies={"session_token": "invalid-token"})

        assert response.status_code == 401
        assert "Invalid or missing session" in response.json()["detail"]

    def test_update_nickname_success(self, client):
        """Test successful nickname update"""
        # Create a session first
        create_response = client.post(
            "/sessions/", json={"nickname": "old_nickname"})
        session_token = create_response.cookies["session_token"]

        # Update the nickname
        update_response = client.put(
            "/sessions/nickname",
            json={"nickname": "new_nickname"},
            cookies={"session_token": session_token}
        )

        assert update_response.status_code == 200
        data = update_response.json()

        assert data["nickname"] == "new_nickname"
        # Token should remain the same
        original_data = create_response.json()
        assert data["token"] == original_data["token"]
        assert data["user_id"] == original_data["user_id"]

    def test_update_nickname_no_session(self, client):
        """Test nickname update without valid session"""
        response = client.put("/sessions/nickname",
                              json={"nickname": "new_nickname"})

        assert response.status_code == 401
        assert "Invalid or missing session" in response.json()["detail"]

    def test_update_nickname_empty(self, client):
        """Test nickname update with empty nickname"""
        # Create a session first
        create_response = client.post(
            "/sessions/", json={"nickname": "test_user"})
        session_token = create_response.cookies["session_token"]

        # Try to update with empty nickname
        response = client.put(
            "/sessions/nickname",
            json={"nickname": ""},
            cookies={"session_token": session_token}
        )

        assert response.status_code == 400
        assert "Nickname cannot be empty" in response.json()["detail"]

    def test_update_nickname_too_long(self, client):
        """Test nickname update with too long nickname"""
        # Create a session first
        create_response = client.post(
            "/sessions/", json={"nickname": "test_user"})
        session_token = create_response.cookies["session_token"]

        # Try to update with too long nickname
        long_nickname = "a" * 101
        response = client.put(
            "/sessions/nickname",
            json={"nickname": long_nickname},
            cookies={"session_token": session_token}
        )

        assert response.status_code == 400
        assert "Nickname too long" in response.json()["detail"]

    def test_logout_success(self, client):
        """Test successful logout"""
        # Create a session first
        create_response = client.post(
            "/sessions/", json={"nickname": "test_user"})
        session_token = create_response.cookies["session_token"]

        # Logout
        logout_response = client.delete(
            "/sessions/", cookies={"session_token": session_token})

        assert logout_response.status_code == 200
        assert logout_response.json()["message"] == "Logged out successfully"

        # Cookie should be cleared
        assert "session_token" not in logout_response.cookies or logout_response.cookies[
            "session_token"] == ""

        # Session should no longer be valid
        validate_response = client.get(
            "/sessions/validate", cookies={"session_token": session_token})
        assert validate_response.status_code == 401

    def test_logout_no_session(self, client):
        """Test logout without session (should still succeed)"""
        response = client.delete("/sessions/")

        assert response.status_code == 200
        assert response.json()["message"] == "Logged out successfully"

    def test_refresh_session_success(self, client):
        """Test successful session refresh"""
        # Create a session first
        create_response = client.post(
            "/sessions/", json={"nickname": "test_user"})
        session_token = create_response.cookies["session_token"]
        original_data = create_response.json()

        # Refresh the session
        refresh_response = client.post(
            "/sessions/refresh", cookies={"session_token": session_token})

        assert refresh_response.status_code == 200
        data = refresh_response.json()

        # Token should be different
        assert data["token"] != original_data["token"]
        # But user_id and nickname should be the same
        assert data["user_id"] == original_data["user_id"]
        assert data["nickname"] == original_data["nickname"]

        # New session cookie should be set
        assert "session_token" in refresh_response.cookies
        new_token = refresh_response.cookies["session_token"]
        assert new_token != session_token

    def test_refresh_session_no_session(self, client):
        """Test session refresh without valid session"""
        response = client.post("/sessions/refresh")

        assert response.status_code == 401
        assert "Invalid or missing session" in response.json()["detail"]

    def test_session_workflow(self, client):
        """Test complete session workflow"""
        # 1. Create session
        create_response = client.post(
            "/sessions/", json={"nickname": "workflow_user"})
        assert create_response.status_code == 200
        session_token = create_response.cookies["session_token"]

        # 2. Validate session
        validate_response = client.get(
            "/sessions/validate", cookies={"session_token": session_token})
        assert validate_response.status_code == 200
        assert validate_response.json()["nickname"] == "workflow_user"

        # 3. Update nickname
        update_response = client.put(
            "/sessions/nickname",
            json={"nickname": "updated_user"},
            cookies={"session_token": session_token}
        )
        assert update_response.status_code == 200
        assert update_response.json()["nickname"] == "updated_user"

        # 4. Validate again to confirm update
        validate_response2 = client.get(
            "/sessions/validate", cookies={"session_token": session_token})
        assert validate_response2.status_code == 200
        assert validate_response2.json()["nickname"] == "updated_user"

        # 5. Refresh session
        refresh_response = client.post(
            "/sessions/refresh", cookies={"session_token": session_token})
        assert refresh_response.status_code == 200
        new_token = refresh_response.cookies["session_token"]

        # 6. Validate with new token
        validate_response3 = client.get(
            "/sessions/validate", cookies={"session_token": new_token})
        assert validate_response3.status_code == 200
        assert validate_response3.json()["nickname"] == "updated_user"

        # 7. Logout
        logout_response = client.delete(
            "/sessions/", cookies={"session_token": new_token})
        assert logout_response.status_code == 200

        # 8. Validate after logout should fail
        validate_response4 = client.get(
            "/sessions/validate", cookies={"session_token": new_token})
        assert validate_response4.status_code == 401

    def test_multiple_sessions_same_nickname(self, client):
        """Test that creating multiple sessions with same nickname deactivates old ones"""
        nickname = "duplicate_user"

        # Create first session
        response1 = client.post("/sessions/", json={"nickname": nickname})
        assert response1.status_code == 200
        token1 = response1.cookies["session_token"]

        # Create second session with same nickname
        response2 = client.post("/sessions/", json={"nickname": nickname})
        assert response2.status_code == 200
        token2 = response2.cookies["session_token"]

        # First session should no longer be valid
        validate1 = client.get("/sessions/validate",
                               cookies={"session_token": token1})
        assert validate1.status_code == 401

        # Second session should be valid
        validate2 = client.get("/sessions/validate",
                               cookies={"session_token": token2})
        assert validate2.status_code == 200
        assert validate2.json()["nickname"] == nickname


class TestSessionMiddleware:
    """Test cases for session middleware functionality"""

    def test_middleware_injects_user_context(self, client):
        """Test that middleware properly injects user context"""
        # This would require a test endpoint that uses the middleware
        # For now, we test indirectly through the session validation endpoint

        # Create a session
        create_response = client.post(
            "/sessions/", json={"nickname": "middleware_test"})
        session_token = create_response.cookies["session_token"]

        # Access an endpoint that should have user context via middleware
        response = client.get("/sessions/validate",
                              cookies={"session_token": session_token})

        assert response.status_code == 200
        assert response.json()["nickname"] == "middleware_test"

    def test_middleware_handles_missing_cookie(self, client):
        """Test that middleware handles missing session cookie gracefully"""
        # Access health check without session cookie
        response = client.get("/health-check")

        # Should succeed regardless of session
        assert response.status_code == 200

    def test_middleware_handles_invalid_cookie(self, client):
        """Test that middleware handles invalid session cookie gracefully"""
        # Access health check with invalid session cookie
        response = client.get(
            "/health-check", cookies={"session_token": "invalid-token"})

        # Should succeed regardless of session
        assert response.status_code == 200
