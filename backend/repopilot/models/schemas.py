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


class ErrorDetail(BaseModel):
    """Standard error response detail."""

    detail: str = Field(..., description="Description of the error encountered.")
