"""Repository ingestion module for Repopilot AI.

Handles cloning, fetching, hard-resetting Git repositories,
and walking the resulting file tree with intelligent filtering.
"""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
from typing import List, Optional, Set, Tuple

import git
from git.exc import BadName, GitCommandError, InvalidGitRepositoryError, NoSuchPathError

from repopilot.models.schemas import FileInfo, RepoStatus

logger = logging.getLogger("repopilot.ingestion")

# Directories to ignore completely during tree walking
EXCLUDED_DIRS: Set[str] = {
    ".git",
    "node_modules",
    "venv",
    ".venv",
    "env",
    ".env",
    "dist",
    "build",
    "vendor",
    "__pycache__",
    ".idea",
    ".vscode",
    ".next",
    ".nuxt",
    "target",
    "bin",
    "obj",
    "coverage",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
}

# Common binary and media file extensions to exclude
EXCLUDED_EXTENSIONS: Set[str] = {
    # Binaries / compiled code
    ".exe", ".dll", ".so", ".dylib", ".bin", ".iso", ".pyc", ".pyo", ".pyd",
    ".class", ".jar", ".war", ".o", ".a", ".obj",
    # Archives
    ".tar", ".gz", ".zip", ".7z", ".rar", ".bz2", ".xz",
    # Images / Media
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp", ".tiff",
    ".mp3", ".wav", ".ogg", ".mp4", ".mov", ".avi", ".mkv", ".webm",
    # Documents / Fonts
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    # Database files
    ".db", ".sqlite", ".sqlite3",
    # Lockfiles
    ".lock",
}

# Exact lockfile names to ignore regardless of extension
EXCLUDED_LOCKFILES: Set[str] = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "gemfile.lock",
    "composer.lock",
    "cargo.lock",
    "flake.lock",
}

MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024  # 2MB


class RepoIngestionError(Exception):
    """Base exception for repository ingestion errors."""
    pass


class InvalidRepoURLError(RepoIngestionError):
    """Raised when the repository URL is invalid or malformed."""
    pass


class RepoAccessError(RepoIngestionError):
    """Raised when repository cannot be accessed (e.g. private repo, not found, auth required)."""
    pass


class EmptyRepoError(RepoIngestionError):
    """Raised when repository contains no commits."""
    pass


class RepoIngestor:
    """Clones or updates remote Git repositories and produces filtered file indices."""

    def __init__(self, base_storage_dir: str | Path = "./repos") -> None:
        self.base_storage_dir = Path(base_storage_dir).resolve()
        self.base_storage_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def compute_repo_id(repo_url: str) -> str:
        """Compute a deterministic 12-char hex digest ID from the repository URL."""
        normalized = repo_url.strip().rstrip("/")
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:12]

    def _get_target_dir(self, repo_id: str) -> Path:
        return self.base_storage_dir / repo_id

    def clone_or_update(self, repo_url: str, branch: Optional[str] = None) -> Tuple[git.Repo, str, str, str]:
        """Clone the repository or update it if already present.

        Returns:
            Tuple of (Repo instance, repo_id, active_branch_name, commit_hash)
        """
        repo_id = self.compute_repo_id(repo_url)
        target_dir = self._get_target_dir(repo_id)

        # Environment to disable interactive credential prompts that would hang the server
        git_env = {"GIT_TERMINAL_PROMPT": "0"}

        # Case 1: Directory exists and is a valid git repository -> Fetch + Reset
        if target_dir.exists() and (target_dir / ".git").exists():
            try:
                repo = git.Repo(target_dir)
            except (InvalidGitRepositoryError, NoSuchPathError):
                logger.warning("Target directory exists but is corrupted. Re-cloning into %s", target_dir)
                import shutil
                shutil.rmtree(target_dir, ignore_errors=True)
                return self._clone_fresh(repo_url, target_dir, repo_id, branch, git_env)

            return self._update_existing(repo, repo_url, target_dir, repo_id, branch, git_env)

        # Case 2: Directory does not exist or has no .git -> Fresh clone
        return self._clone_fresh(repo_url, target_dir, repo_id, branch, git_env)

    def _clone_fresh(
        self,
        repo_url: str,
        target_dir: Path,
        repo_id: str,
        branch: Optional[str],
        git_env: dict,
    ) -> Tuple[git.Repo, str, str, str]:
        logger.info("Cloning fresh repository %s into %s", repo_url, target_dir)
        clone_kwargs = {"env": git_env}
        if branch:
            clone_kwargs["branch"] = branch

        try:
            repo = git.Repo.clone_from(repo_url, str(target_dir), **clone_kwargs)
        except GitCommandError as e:
            self._handle_git_error(e, repo_url)
        except Exception as e:
            raise RepoAccessError(f"Failed to clone repository: {str(e)}") from e

        active_branch, commit_hash = self._inspect_repo(repo)
        return repo, repo_id, active_branch, commit_hash

    def _update_existing(
        self,
        repo: git.Repo,
        repo_url: str,
        target_dir: Path,
        repo_id: str,
        branch: Optional[str],
        git_env: dict,
    ) -> Tuple[git.Repo, str, str, str]:
        logger.info("Updating existing repository at %s", target_dir)
        try:
            with repo.git.custom_environment(**git_env):
                if "origin" in repo.remotes:
                    origin = repo.remotes.origin
                    origin.set_url(repo_url)
                else:
                    origin = repo.create_remote("origin", repo_url)

                origin.fetch(prune=True)

                target_branch = branch
                if not target_branch:
                    try:
                        target_branch = repo.active_branch.name
                    except (TypeError, ValueError):
                        target_branch = origin.refs[0].name.split("/")[-1] if origin.refs else "main"

                if target_branch in repo.heads:
                    repo.heads[target_branch].checkout()
                else:
                    repo.git.checkout("-B", target_branch, f"origin/{target_branch}")

                repo.git.reset("--hard", f"origin/{target_branch}")
                repo.git.clean("-fdx")

        except GitCommandError as e:
            self._handle_git_error(e, repo_url)
        except Exception as e:
            raise RepoAccessError(f"Failed to update repository: {str(e)}") from e

        active_branch, commit_hash = self._inspect_repo(repo)
        return repo, repo_id, active_branch, commit_hash

    def _inspect_repo(self, repo: git.Repo) -> Tuple[str, str]:
        """Extract active branch name and latest commit hash, validating non-empty status."""
        try:
            if not repo.heads and not repo.remotes:
                raise EmptyRepoError("Repository contains no branches or commits.")

            commit = repo.head.commit
            commit_hash = commit.hexsha
        except (BadName, ValueError, TypeError) as e:
            raise EmptyRepoError("Repository has no commits.") from e

        try:
            active_branch = repo.active_branch.name
        except (TypeError, ValueError):
            active_branch = "HEAD"

        return active_branch, commit_hash

    def _handle_git_error(self, exc: GitCommandError, repo_url: str) -> None:
        """Categorize git command failures into appropriate user-facing exceptions."""
        err_msg = exc.stderr.lower() if exc.stderr else str(exc).lower()

        if "not found" in err_msg or "could not resolve host" in err_msg:
            raise RepoAccessError(f"Repository not found or network host unreachable: {repo_url}")
        if "authentication failed" in err_msg or "permission denied" in err_msg or "terminal prompts disabled" in err_msg:
            raise RepoAccessError(f"Access denied or authentication required for repository: {repo_url}")
        if "remote branch" in err_msg and "not found" in err_msg:
            raise InvalidRepoURLError(f"Specified branch not found in repository.")
        if "does not appear to be a git repository" in err_msg or "fatal: repository" in err_msg:
            raise InvalidRepoURLError(f"Invalid Git repository URL: {repo_url}")

        raise RepoAccessError(f"Git operation failed: {exc.stderr or str(exc)}")

    def walk_and_filter(self, repo_path: Path) -> List[FileInfo]:
        """Traverse the repository directory tree, filtering out binaries, artifacts,

        lockfiles, empty files, and files exceeding size limits.
        """
        filtered_files: List[FileInfo] = []

        for root, dirs, files in os.walk(repo_path):
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS and not d.startswith(".")]

            for filename in files:
                lower_filename = filename.lower()

                if lower_filename in EXCLUDED_LOCKFILES:
                    continue

                if filename.startswith("."):
                    continue

                file_path = Path(root) / filename
                ext = file_path.suffix.lower()

                if ext in EXCLUDED_EXTENSIONS:
                    continue

                try:
                    stat = file_path.stat()
                    file_size = stat.st_size

                    if file_size == 0 or file_size > MAX_FILE_SIZE_BYTES:
                        continue

                    rel_path = file_path.relative_to(repo_path).as_posix()

                    filtered_files.append(
                        FileInfo(
                            path=rel_path,
                            extension=ext if ext else "",
                            size=file_size,
                        )
                    )
                except (OSError, PermissionError) as e:
                    logger.debug("Skipping file %s due to access error: %s", file_path, e)
                    continue

        filtered_files.sort(key=lambda f: f.path)
        return filtered_files

    def ingest(self, repo_url: str, branch: Optional[str] = None) -> RepoStatus:
        """Main entrypoint: clones or updates repository, filters files, and produces RepoStatus."""
        repo, repo_id, active_branch, commit_hash = self.clone_or_update(repo_url, branch=branch)
        target_dir = self._get_target_dir(repo_id)

        files = self.walk_and_filter(target_dir)

        return RepoStatus(
            repo_id=repo_id,
            url=repo_url,
            branch=active_branch,
            commit_hash=commit_hash,
            file_count=len(files),
            files=files,
        )
