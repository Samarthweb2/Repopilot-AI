
"""Pydantic schemas for Repopilot AI."""

from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class RepoCreateRequest(BaseModel):
    """Payload for POST /repos endpoint."""

    repo_url: str = Field(
        ...,
        description="Public or authenticated Git repository URL (e.g., https://github.com/user/repo.git)",
        examples=["https://github.com/octocat/Hello-World.git"],
    )
    branch: Optional[str] = Field(
        default=None,
        description="Optional branch name to checkout. If omitted, uses default remote branch.",
        examples=["main"],
    )

    @field_validator("repo_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        url = v.strip()
        if not url:
            raise ValueError("Repository URL cannot be empty.")
        if not (url.startswith("http://") or url.startswith("https://") or url.startswith("git@") or url.startswith("file://")):
            raise ValueError("Repository URL must be a valid HTTP(S), SSH, or file URL.")
        return url


class FileInfo(BaseModel):
    """Metadata describing a single indexed file in the repository."""

    path: str = Field(..., description="Relative file path from repository root.")
    extension: str = Field(..., description="File extension including leading dot, e.g., '.py'.")
    size: int = Field(..., description="File size in bytes.")


class RepoStatus(BaseModel):
    """Status and metadata returned when a repository is cloned or updated."""

    repo_id: str = Field(..., description="Deterministic hash ID derived from repository URL.")
    url: str = Field(..., description="Original repository URL.")
    branch: str = Field(..., description="Active branch name.")
    commit_hash: str = Field(..., description="Latest commit SHA hash.")
    file_count: int = Field(..., description="Total count of filtered, valid code files.")
    files: List[FileInfo] = Field(
        default_factory=list,
        description="List of file metadata items.",
    )


class RepoSummary(BaseModel):
    """Summary of a locally cloned repository for the dashboard."""

    repo_id: str = Field(..., description="Deterministic hash ID derived from repository URL.")
    url: str = Field(..., description="Repository URL.")
    branch: str = Field(..., description="Active branch name.")
    commit_hash: str = Field(..., description="Latest commit SHA hash.")
    commit_message: Optional[str] = Field(default=None, description="First line of the latest commit message.")
    commit_date: Optional[str] = Field(default=None, description="ISO timestamp of the latest commit.")
    file_count: int = Field(default=0, description="Total count of filtered code files.")
    is_indexed: bool = Field(default=False, description="Whether code chunks are indexed in ChromaDB vector store.")
    indexed_chunks: int = Field(default=0, description="Number of indexed chunks if known.")
    status: str = Field(default="cloned", description="High-level status: 'cloned' or 'indexed'.")


class FileContentResponse(BaseModel):
    """Response containing content of a file or slice from the repository."""

    repo_id: str = Field(..., description="Repository ID.")
    file_path: str = Field(..., description="Relative file path.")
    total_lines: int = Field(..., description="Total line count in file.")
    start_line: int = Field(..., description="1-indexed starting line.")
    end_line: int = Field(..., description="1-indexed ending line.")
    content: str = Field(..., description="Raw text content of the requested slice.")


class ErrorDetail(BaseModel):
    """Standard error response detail."""

    detail: str = Field(..., description="Description of the error encountered.")


class UserResponse(BaseModel):
    """User profile response."""

    id: str = Field(..., description="Unique user identifier.")
    email: str = Field(..., description="User email address.")
    name: str = Field(..., description="Display name of user.")
    avatar_url: Optional[str] = Field(default=None, description="User avatar image URL.")
    provider: str = Field(default="email", description="Authentication provider: 'email', 'google', or 'github'.")
    created_at: str = Field(..., description="ISO creation timestamp.")


class UserRegisterRequest(BaseModel):
    """Request payload for registering a new user."""

    email: str = Field(..., description="User email address.")
    name: str = Field(..., description="User full or display name.")
    password: str = Field(..., min_length=6, description="Password with minimum 6 characters.")


class UserLoginRequest(BaseModel):
    """Request payload for logging in with email and password."""

    email: str = Field(..., description="User email address.")
    password: str = Field(..., description="User password.")


class OAuthLoginRequest(BaseModel):
    """Request payload for authenticating via Google or GitHub OAuth."""

    provider: str = Field(..., description="OAuth provider: 'google' or 'github'.")
    credential: Optional[str] = Field(default=None, description="OAuth ID token or access token from provider.")
    code: Optional[str] = Field(default=None, description="OAuth authorization code for token exchange.")
    redirect_uri: Optional[str] = Field(default=None, description="Redirect URI used in OAuth authorization request.")
    email: Optional[str] = Field(default=None, description="User email (if provided directly from client OAuth SDK).")
    name: Optional[str] = Field(default=None, description="User name (if provided directly from client OAuth SDK).")
    avatar_url: Optional[str] = Field(default=None, description="User avatar URL.")


class AuthTokenResponse(BaseModel):
    """Authentication token response with user profile."""

    access_token: str = Field(..., description="Bearer JWT / session access token.")
    token_type: str = Field(default="bearer", description="Token type.")
    user: UserResponse = Field(..., description="Authenticated user profile.")


