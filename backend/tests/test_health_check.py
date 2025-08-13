import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check_returns_200():
    """Test that health check endpoint returns 200 when database is healthy"""
    response = client.get("/health-check")
    assert response.status_code == 200
    assert response.json() == {}