"""Unit and integration tests for Repopilot AI authentication & security endpoints."""

import pytest
from fastapi.testclient import TestClient
from repopilot.api.auth import _FAILED_LOGIN_ATTEMPTS, _hash_password, _verify_password
from repopilot.main import app


@pytest.fixture
def client():
    # Clear rate limiter state between test runs
    _FAILED_LOGIN_ATTEMPTS.clear()
    return TestClient(app)


def test_scrypt_password_hashing():
    """Verify passwords are hashed with memory-hard scrypt and unique salts."""
    pwd = "secure_password_123!"
    hash1, salt1 = _hash_password(pwd)
    hash2, salt2 = _hash_password(pwd)

    # Hashes must differ because salts are uniquely generated
    assert salt1 != salt2
    assert hash1 != hash2
    assert len(hash1) == 128  # 64 bytes in hex

    # Verification must succeed for correct password and fail for wrong password
    assert _verify_password(pwd, salt1, hash1) is True
    assert _verify_password("wrong_password", salt1, hash1) is False


def test_auth_register_with_cookie(client):
    """Test registering a new user sets httpOnly cookie and returns user."""
    email = "test.cookie@repopilot.ai"
    reg_payload = {
        "email": email,
        "name": "Cookie Tester",
        "password": "secretpassword123",
    }
    res = client.post("/auth/register", json=reg_payload)
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == email

    # Check set-cookie header contains repopilot_session
    assert "repopilot_session" in res.cookies

    # Verify /auth/me succeeds using the session cookie alone (no Authorization header)
    me_res = client.get("/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email


def test_auth_duplicate_register_fails(client):
    """Test duplicate registration returns 400."""
    email = "duplicate.user@repopilot.ai"
    reg_payload = {
        "email": email,
        "name": "Duplicate User",
        "password": "secretpassword123",
    }
    res1 = client.post("/auth/register", json=reg_payload)
    assert res1.status_code == 201

    res2 = client.post("/auth/register", json=reg_payload)
    assert res2.status_code == 400
    assert "already exists" in res2.json()["detail"]


def test_auth_rate_limiting(client):
    """Verify rate limiter blocks after 5 failed login attempts with HTTP 429."""
    email = "ratelimit.target@repopilot.ai"
    client.post(
        "/auth/register",
        json={"email": email, "name": "Rate Limit Target", "password": "correctpassword"},
    )

    # 5 failed login attempts
    for _ in range(5):
        fail_res = client.post("/auth/login", json={"email": email, "password": "wrongpassword"})
        assert fail_res.status_code == 401

    # 6th attempt should be blocked with 429 Too Many Requests
    blocked_res = client.post("/auth/login", json={"email": email, "password": "wrongpassword"})
    assert blocked_res.status_code == 429
    assert "Too many failed login attempts" in blocked_res.json()["detail"]
    assert "Retry-After" in blocked_res.headers


def test_demo_login_endpoint(client):
    """Test instant demo login provides active session without fake Google branding."""
    res = client.post("/auth/demo")
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["email"] == "demo@repopilot.ai"
    assert data["user"]["name"] == "Demo Developer"
    assert data["user"]["provider"] == "demo"
    assert "repopilot_session" in res.cookies

    # Verify session is active
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "demo@repopilot.ai"


def test_google_oauth_endpoints(client):
    """Test Google OAuth URL and auth endpoints."""
    # Test /auth/google/url
    url_res = client.get("/auth/google/url")
    assert url_res.status_code == 200
    assert "configured" in url_res.json()

    # Test /auth/google authentication
    payload = {
        "provider": "google",
        "email": "verified.user@gmail.com",
        "name": "Verified User",
        "avatar_url": "https://lh3.googleusercontent.com/a/verified",
    }
    res = client.post("/auth/google", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["provider"] == "google"
    assert data["user"]["email"] == "verified.user@gmail.com"


def test_logout_clears_cookie_and_session(client):
    """Test logging out invalidates session and clears cookie."""
    login_res = client.post("/auth/demo")
    assert login_res.status_code == 200
    assert "repopilot_session" in login_res.cookies

    # Log out
    logout_res = client.post("/auth/logout")
    assert logout_res.status_code == 200

    # Next /auth/me should fail with 401
    me_res = client.get("/auth/me")
    assert me_res.status_code == 401
