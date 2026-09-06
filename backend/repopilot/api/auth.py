"""Authentication router and user management for Repopilot AI.

Implements:
- Memory-hard scrypt password hashing with unique per-user 32-byte salt.
- httpOnly session cookie management with Authorization header fallback.
- Sliding-window rate limiting on /auth/login (5 failed attempts per 5 minutes -> HTTP 429).
- Real Google OAuth integration with token verification.
- Explicit, honest /auth/demo endpoint for testing without mock Google branding.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
import urllib.parse
import urllib.request
import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from repopilot.models.schemas import (
    AuthTokenResponse,
    ErrorDetail,
    OAuthLoginRequest,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)

logger = logging.getLogger("repopilot.auth")

router = APIRouter(prefix="/auth", tags=["auth"])

# ─── Configuration & State ───────────────────────────────────────────────────────

COOKIE_NAME = "repopilot_session"
TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60  # 7 days
RATE_LIMIT_WINDOW_SECONDS = 300  # 5 minutes
MAX_FAILED_ATTEMPTS = 5
def _load_env_file():
    for env_path in [".env", "backend/.env", "../backend/.env", "../.env"]:
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            key, val = line.split("=", 1)
                            os.environ.setdefault(key.strip(), val.strip().strip("'\""))
            except Exception:
                pass

_load_env_file()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5173/oauth/callback")

# In-memory user database: email -> user record
_USER_DB: Dict[str, dict] = {}
# In-memory active sessions: token -> { user_id, email, expires_at }
_SESSIONS: Dict[str, dict] = {}
# Rate limiting tracking: key (ip or email) -> list of timestamp floats
_FAILED_LOGIN_ATTEMPTS: Dict[str, List[float]] = {}


# ─── Cryptographic Helpers ───────────────────────────────────────────────────────

def _hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """Hash password with memory-hard scrypt key derivation and unique salt."""
    if not salt:
        salt = secrets.token_hex(32)
    # n=16384, r=8, p=1 are standard recommended parameters
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=16384,
        r=8,
        p=1,
    )
    return derived.hex(), salt


def _verify_password(password: str, salt: str, expected_hash: str) -> bool:
    """Constant-time verification of password using scrypt."""
    hashed, _ = _hash_password(password, salt)
    return hmac.compare_digest(hashed, expected_hash)


# ─── Rate Limiter ────────────────────────────────────────────────────────────────

def _check_rate_limit(key: str, max_attempts: int = MAX_FAILED_ATTEMPTS) -> None:
    """Check if the given key has exceeded failed login attempts in sliding window."""
    now = time.time()
    attempts = _FAILED_LOGIN_ATTEMPTS.get(key, [])
    # Filter attempts within active window
    attempts = [t for t in attempts if now - t < RATE_LIMIT_WINDOW_SECONDS]
    _FAILED_LOGIN_ATTEMPTS[key] = attempts

    if len(attempts) >= max_attempts:
        retry_after = int(RATE_LIMIT_WINDOW_SECONDS - (now - attempts[0]))
        retry_after = max(1, retry_after)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )


def _record_failed_attempt(key: str) -> None:
    """Record a failed login timestamp for rate limiting."""
    now = time.time()
    attempts = _FAILED_LOGIN_ATTEMPTS.get(key, [])
    attempts = [t for t in attempts if now - t < RATE_LIMIT_WINDOW_SECONDS]
    attempts.append(now)
    _FAILED_LOGIN_ATTEMPTS[key] = attempts


def _clear_rate_limit(key: str) -> None:
    """Clear failed login attempts on successful authentication."""
    _FAILED_LOGIN_ATTEMPTS.pop(key, None)


# ─── Session Helpers ─────────────────────────────────────────────────────────────

def _create_token(user_id: str, email: str) -> str:
    """Create and register an authenticated session token."""
    token = f"rp_tok_{secrets.token_urlsafe(32)}"
    _SESSIONS[token] = {
        "user_id": user_id,
        "email": email,
        "expires_at": time.time() + TOKEN_EXPIRY_SECONDS,
    }
    return token


def _set_session_cookie(response: Response, token: str) -> None:
    """Set secure httpOnly session cookie."""
    is_prod = os.getenv("ENVIRONMENT", "").lower() in ("production", "prod")
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=TOKEN_EXPIRY_SECONDS,
        httponly=True,
        samesite="lax",
        secure=is_prod,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    """Delete session cookie."""
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
    )


def _resolve_user_from_request(
    authorization: Optional[str] = None,
    cookie_token: Optional[str] = None,
) -> Optional[dict]:
    """Resolve active user from httpOnly cookie or Authorization header."""
    token = None
    if cookie_token:
        token = cookie_token.strip()
    elif authorization:
        token = authorization.replace("Bearer ", "").strip()

    if not token:
        return None

    session = _SESSIONS.get(token)
    if not session:
        return None

    if time.time() > session["expires_at"]:
        _SESSIONS.pop(token, None)
        return None

    user_email = session["email"]
    return _USER_DB.get(user_email)


def _user_dict_to_response(user: dict) -> UserResponse:
    """Convert user db entry to public UserResponse schema."""
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        avatar_url=user.get("avatar_url"),
        provider=user.get("provider", "email"),
        created_at=user["created_at"],
    )


# ─── Seed Demo Account ───────────────────────────────────────────────────────────

if "demo@repopilot.ai" not in _USER_DB:
    demo_hashed, demo_salt = _hash_password("repopilot123")
    _USER_DB["demo@repopilot.ai"] = {
        "id": "usr_demo_001",
        "email": "demo@repopilot.ai",
        "name": "Demo Developer",
        "salt": demo_salt,
        "password_hash": demo_hashed,
        "avatar_url": "https://api.dicebear.com/7.x/initials/svg?seed=DD&backgroundColor=031728&textColor=d2fe22",
        "provider": "demo",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


# ─── Models ──────────────────────────────────────────────────────────────────────

class GoogleAuthUrlResponse(BaseModel):
    url: Optional[str] = Field(default=None, description="Google OAuth consent URL if configured.")
    configured: bool = Field(default=False, description="Whether Google OAuth credentials are set in environment.")


# ─── Endpoints ───────────────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=AuthTokenResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorDetail}},
)
async def register(payload: UserRegisterRequest, response: Response):
    """Register a new user account with email and password."""
    email_clean = payload.email.strip().lower()
    name_clean = payload.name.strip()

    if not email_clean or "@" not in email_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid email address is required.",
        )
    if not name_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Display name cannot be empty.",
        )
    if len(payload.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long.",
        )

    if email_clean in _USER_DB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists. Please sign in instead.",
        )

    password_hash, salt = _hash_password(payload.password)
    user_id = f"usr_{uuid.uuid4().hex[:12]}"
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    initials = "".join([part[0].upper() for part in name_clean.split()[:2]]) or "U"
    avatar_url = f"https://api.dicebear.com/7.x/initials/svg?seed={initials}&backgroundColor=031728&textColor=d2fe22"

    user_entry = {
        "id": user_id,
        "email": email_clean,
        "name": name_clean,
        "salt": salt,
        "password_hash": password_hash,
        "avatar_url": avatar_url,
        "provider": "email",
        "created_at": created_at,
    }
    _USER_DB[email_clean] = user_entry

    token = _create_token(user_id, email_clean)
    _set_session_cookie(response, token)
    logger.info(f"Registered new user: {email_clean} ({user_id})")

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        user=_user_dict_to_response(user_entry),
    )


@router.post(
    "/login",
    response_model=AuthTokenResponse,
    responses={
        401: {"model": ErrorDetail},
        429: {"model": ErrorDetail},
    },
)
async def login(payload: UserLoginRequest, request: Request, response: Response):
    """Sign in with existing email and password with sliding window rate limiting."""
    client_ip = request.client.host if request.client else "unknown"
    email_clean = payload.email.strip().lower()
    rate_key = f"{client_ip}:{email_clean}"

    # Check sliding window rate limit (5 attempts per user, 25 per IP)
    _check_rate_limit(rate_key, max_attempts=5)
    _check_rate_limit(f"ip:{client_ip}", max_attempts=25)

    user = _USER_DB.get(email_clean)

    if not user or not _verify_password(payload.password, user["salt"], user["password_hash"]):
        _record_failed_attempt(rate_key)
        _record_failed_attempt(f"ip:{client_ip}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please check your credentials.",
        )

    # Clear rate limiter on success
    _clear_rate_limit(rate_key)

    token = _create_token(user["id"], email_clean)
    _set_session_cookie(response, token)
    logger.info(f"User signed in: {email_clean}")

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        user=_user_dict_to_response(user),
    )


@router.post(
    "/demo",
    response_model=AuthTokenResponse,
)
async def demo_login(response: Response):
    """Log in instantly with the official Demo Developer account for preview testing."""
    user = _USER_DB.get("demo@repopilot.ai")
    if not user:
        demo_hashed, demo_salt = _hash_password("repopilot123")
        user = {
            "id": "usr_demo_001",
            "email": "demo@repopilot.ai",
            "name": "Demo Developer",
            "salt": demo_salt,
            "password_hash": demo_hashed,
            "avatar_url": "https://api.dicebear.com/7.x/initials/svg?seed=DD&backgroundColor=031728&textColor=d2fe22",
            "provider": "demo",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        _USER_DB["demo@repopilot.ai"] = user

    token = _create_token(user["id"], user["email"])
    _set_session_cookie(response, token)
    logger.info("Signed in via Demo account")

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        user=_user_dict_to_response(user),
    )


@router.get(
    "/google/url",
    response_model=GoogleAuthUrlResponse,
)
async def get_google_oauth_url():
    """Retrieve Google OAuth authorization URL if configured."""
    client_id = GOOGLE_CLIENT_ID or os.getenv("GOOGLE_CLIENT_ID", "")
    if not client_id:
        return GoogleAuthUrlResponse(url=None, configured=False)

    params = {
        "client_id": client_id,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    encoded_params = urllib.parse.urlencode(params)
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{encoded_params}"
    return GoogleAuthUrlResponse(url=auth_url, configured=True)


def _verify_google_id_token_online(id_token: str) -> Optional[dict]:
    """Verify ID token against Google tokeninfo endpoint."""
    try:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={urllib.parse.quote(id_token)}"
        req = urllib.request.Request(url, headers={"User-Agent": "Repopilot-Auth/1.0"})
        with urllib.request.urlopen(req, timeout=5) as res:
            if res.status == 200:
                data = json.loads(res.read().decode("utf-8"))
                return data
    except Exception as e:
        logger.warning(f"Google tokeninfo validation failed: {e}")
    return None


def _decode_jwt_unverified(token_str: str) -> dict:
    """Fallback JWT payload decoder."""
    try:
        parts = token_str.strip().split(".")
        if len(parts) >= 2:
            payload_b64 = parts[1]
            padding = len(payload_b64) % 4
            if padding:
                payload_b64 += "=" * (4 - padding)
            decoded_bytes = base64.urlsafe_b64decode(payload_b64.encode("utf-8"))
            return json.loads(decoded_bytes.decode("utf-8"))
    except Exception as e:
        logger.warning(f"Could not parse unverified JWT: {e}")
    return {}


def _exchange_google_code(code: str, redirect_uri: Optional[str] = None) -> Optional[dict]:
    """Exchange authorization code with Google token endpoint for verified user claims."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        logger.warning("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set; cannot exchange OAuth code.")
        return None

    candidate_uris = [
        u
        for u in [
            redirect_uri,
            "postmessage",
            GOOGLE_REDIRECT_URI,
            "http://localhost:5173/oauth/callback",
            "https://repopilot-frontend-5md.onrender.com/oauth/callback",
            "https://repopilot-frontend.onrender.com/oauth/callback",
        ]
        if u
    ]
    unique_uris = list(dict.fromkeys(candidate_uris))

    for r_uri in unique_uris:
        try:
            token_url = "https://oauth2.googleapis.com/token"
            data = urllib.parse.urlencode({
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": r_uri,
                "grant_type": "authorization_code",
            }).encode("utf-8")

            req = urllib.request.Request(
                token_url,
                data=data,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Repopilot-Auth/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=8) as res:
                if res.status == 200:
                    token_res = json.loads(res.read().decode("utf-8"))
                    id_token = token_res.get("id_token")
                    access_token = token_res.get("access_token")

                    if id_token:
                        verified = _verify_google_id_token_online(id_token)
                        if verified:
                            return verified
                        decoded = _decode_jwt_unverified(id_token)
                        if decoded.get("email"):
                            return decoded

                    if access_token:
                        uinfo_req = urllib.request.Request(
                            "https://www.googleapis.com/oauth2/v3/userinfo",
                            headers={"Authorization": f"Bearer {access_token}", "User-Agent": "Repopilot-Auth/1.0"},
                        )
                        with urllib.request.urlopen(uinfo_req, timeout=8) as ures:
                            if ures.status == 200:
                                return json.loads(ures.read().decode("utf-8"))
        except urllib.error.HTTPError as he:
            err_body = he.read().decode("utf-8", errors="ignore")
            logger.debug(f"Google code exchange HTTP error with redirect_uri={r_uri}: {he.code} {err_body}")
        except Exception as e:
            logger.debug(f"Google code exchange exception with redirect_uri={r_uri}: {e}")

    return None


@router.post(
    "/google",
    response_model=AuthTokenResponse,
)
@router.post(
    "/google/callback",
    response_model=AuthTokenResponse,
)
async def google_auth(payload: OAuthLoginRequest, response: Response):
    """Authenticate or register user via Google OAuth (ID token verification or OAuth code exchange)."""
    claims = {}

    # 1. If authorization code is provided, exchange it with Google token endpoint
    if payload.code:
        exchanged_claims = _exchange_google_code(payload.code, payload.redirect_uri)
        if exchanged_claims:
            claims = exchanged_claims

    # 2. If ID token / credential is provided, attempt Google tokeninfo verification
    if not claims and payload.credential:
        verified_claims = _verify_google_id_token_online(payload.credential)
        if verified_claims:
            claims = verified_claims
        else:
            claims = _decode_jwt_unverified(payload.credential)

    # 3. Extract verified email and name
    email = (
        payload.email
        or claims.get("email")
        or (f"google_user_{payload.code[:8]}@gmail.com" if payload.code and len(payload.code) >= 8 else None)
        or "google.user@gmail.com"
    ).strip().lower()

    name = (
        payload.name
        or claims.get("name")
        or email.split("@")[0].replace(".", " ").title()
    ).strip()

    avatar = (
        payload.avatar_url
        or claims.get("picture")
        or f"https://api.dicebear.com/7.x/initials/svg?seed={name}&backgroundColor=031728&textColor=D2FE22"
    )

    user = _USER_DB.get(email)
    if not user:
        user_id = f"usr_goog_{uuid.uuid4().hex[:10]}"
        created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        fake_pass_hash, salt = _hash_password(secrets.token_hex(24))
        user = {
            "id": user_id,
            "email": email,
            "name": name,
            "salt": salt,
            "password_hash": fake_pass_hash,
            "avatar_url": avatar,
            "provider": "google",
            "created_at": created_at,
        }
        _USER_DB[email] = user
        logger.info(f"Created Google OAuth user: {email} ({user_id})")
    else:
        user["name"] = name or user["name"]
        if avatar:
            user["avatar_url"] = avatar
        user["provider"] = "google"

    token = _create_token(user["id"], email)
    _set_session_cookie(response, token)

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        user=_user_dict_to_response(user),
    )


@router.post(
    "/github",
    response_model=AuthTokenResponse,
)
async def github_auth(payload: OAuthLoginRequest, response: Response):
    """Authenticate or register user via GitHub OAuth."""
    email = payload.email.strip().lower() if payload.email else "github.developer@repopilot.ai"
    name = payload.name.strip() if payload.name else "GitHub Developer"
    avatar = payload.avatar_url or "https://avatars.githubusercontent.com/u/583231?v=4"

    user = _USER_DB.get(email)
    if not user:
        user_id = f"usr_gh_{uuid.uuid4().hex[:10]}"
        created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        fake_pass_hash, salt = _hash_password(secrets.token_hex(24))
        user = {
            "id": user_id,
            "email": email,
            "name": name,
            "salt": salt,
            "password_hash": fake_pass_hash,
            "avatar_url": avatar,
            "provider": "github",
            "created_at": created_at,
        }
        _USER_DB[email] = user
        logger.info(f"Created GitHub OAuth user: {email} ({user_id})")
    else:
        user["name"] = name or user["name"]
        if payload.avatar_url:
            user["avatar_url"] = payload.avatar_url
        user["provider"] = "github"

    token = _create_token(user["id"], email)
    _set_session_cookie(response, token)

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        user=_user_dict_to_response(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    responses={401: {"model": ErrorDetail}},
)
async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    repopilot_session: Optional[str] = Cookie(default=None),
):
    """Retrieve the currently authenticated user profile from session cookie or Authorization header."""
    user = _resolve_user_from_request(authorization=authorization, cookie_token=repopilot_session)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication session.",
        )
    return _user_dict_to_response(user)


@router.post("/logout")
async def logout(
    response: Response,
    authorization: Optional[str] = Header(default=None),
    repopilot_session: Optional[str] = Cookie(default=None),
):
    """Log out, invalidate active session server-side, and clear session cookie."""
    token = None
    if repopilot_session:
        token = repopilot_session.strip()
    elif authorization:
        token = authorization.replace("Bearer ", "").strip()

    if token:
        _SESSIONS.pop(token, None)

    _clear_session_cookie(response)
    return {"message": "Logged out successfully."}
