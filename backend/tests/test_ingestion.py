"""Unit tests for RepoIngestor and tree filtering in backend."""

import hashlib
import os
import shutil
import tempfile
from pathlib import Path

import git
import pytest

from repopilot.ingestion.clone import (
    EmptyRepoError,
    InvalidRepoURLError,
    RepoAccessError,
    RepoIngestor,
)


@pytest.fixture
def temp_storage_dir():
    """Create a temporary directory for repository storage."""
    tmp = tempfile.mkdtemp()
    yield Path(tmp)
    shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture
def ingestor(temp_storage_dir):
    """RepoIngestor instance pointing to temp storage."""
    return RepoIngestor(base_storage_dir=temp_storage_dir)


def test_repo_id_deterministic():
    """Hash computation should be deterministic and ignore trailing slashes."""
    url1 = "https://github.com/fastapi/fastapi"
    url2 = "https://github.com/fastapi/fastapi/"
    id1 = RepoIngestor.compute_repo_id(url1)
    id2 = RepoIngestor.compute_repo_id(url2)
    assert id1 == id2
    assert len(id1) == 12
    expected = hashlib.sha256(b"https://github.com/fastapi/fastapi").hexdigest()[:12]
    assert id1 == expected


def test_walk_and_filter(ingestor, temp_storage_dir):
    """Verify intelligent filtering of directories, binaries, lockfiles, empty & large files."""
    repo_dir = temp_storage_dir / "sample_repo"
    repo_dir.mkdir(parents=True, exist_ok=True)

    # 1. Valid code files
    (repo_dir / "main.py").write_text("print('hello')", encoding="utf-8")
    sub = repo_dir / "src" / "utils"
    sub.mkdir(parents=True, exist_ok=True)
    (sub / "helper.ts").write_text("export const x = 1;", encoding="utf-8")
    (repo_dir / "README.md").write_text("# Readme", encoding="utf-8")

    # 2. Excluded directories
    nm = repo_dir / "node_modules" / "lodash"
    nm.mkdir(parents=True, exist_ok=True)
    (nm / "index.js").write_text("module.exports = {};", encoding="utf-8")

    git_dir = repo_dir / ".git" / "objects"
    git_dir.mkdir(parents=True, exist_ok=True)
    (git_dir / "commit.txt").write_text("git internal", encoding="utf-8")

    venv_dir = repo_dir / "venv" / "lib"
    venv_dir.mkdir(parents=True, exist_ok=True)
    (venv_dir / "pip.py").write_text("# venv code", encoding="utf-8")

    # 3. Excluded binary extensions
    (repo_dir / "app.exe").write_bytes(b"\x00\x01\x02")
    (repo_dir / "library.dll").write_bytes(b"\x00\x01\x02")
    (repo_dir / "avatar.png").write_bytes(b"\x89PNG\r\n\x1a\n")

    # 4. Excluded lockfiles
    (repo_dir / "package-lock.json").write_text('{"lockfileVersion": 3}', encoding="utf-8")
    (repo_dir / "yarn.lock").write_text("# yarn lockfile", encoding="utf-8")
    (repo_dir / "Cargo.lock").write_text("# cargo lockfile", encoding="utf-8")

    # 5. Empty file (0 bytes)
    (repo_dir / "empty.py").write_text("", encoding="utf-8")

    # 6. Large file (>2MB)
    large_file = repo_dir / "huge_data.json"
    with open(large_file, "wb") as f:
        f.seek(2 * 1024 * 1024 + 10)
        f.write(b"0")

    # Run filtering
    files = ingestor.walk_and_filter(repo_dir)

    paths = [f.path for f in files]

    assert "main.py" in paths
    assert "src/utils/helper.ts" in paths
    assert "README.md" in paths
    assert len(files) == 3

    assert not any("node_modules" in p for p in paths)
    assert not any(".git" in p for p in paths)
    assert not any("venv" in p for p in paths)
    assert not any(p.endswith(".exe") or p.endswith(".dll") or p.endswith(".png") for p in paths)
    assert "package-lock.json" not in paths
    assert "empty.py" not in paths
    assert "huge_data.json" not in paths


def test_clone_and_update_local_git_repo(ingestor, temp_storage_dir):
    """Test end-to-end ingest with a local git repo: clone, file index, update on new commit."""
    origin_dir = temp_storage_dir / "remote_origin"
    origin_dir.mkdir(parents=True, exist_ok=True)
    origin_repo = git.Repo.init(origin_dir)

    origin_repo.config_writer().set_value("user", "name", "Repopilot Test").release()
    origin_repo.config_writer().set_value("user", "email", "test@repopilot.local").release()

    file1 = origin_dir / "app.py"
    file1.write_text("print('v1')", encoding="utf-8")
    origin_repo.index.add(["app.py"])
    first_commit = origin_repo.index.commit("Initial commit")

    try:
        origin_repo.git.branch("-M", "main")
    except Exception:
        pass

    origin_url = origin_dir.as_uri()
    status1 = ingestor.ingest(origin_url)

    assert status1.repo_id == RepoIngestor.compute_repo_id(origin_url)
    assert status1.file_count == 1
    assert status1.files[0].path == "app.py"
    assert status1.commit_hash == first_commit.hexsha

    file2 = origin_dir / "utils.py"
    file2.write_text("def util(): pass", encoding="utf-8")
    origin_repo.index.add(["utils.py"])
    second_commit = origin_repo.index.commit("Second commit")

    status2 = ingestor.ingest(origin_url)

    assert status2.commit_hash == second_commit.hexsha
    assert status2.file_count == 2
    paths = [f.path for f in status2.files]
    assert "app.py" in paths
    assert "utils.py" in paths


def test_empty_repo_raises_error(ingestor, temp_storage_dir):
    """An empty repository with no commits should raise EmptyRepoError."""
    empty_dir = temp_storage_dir / "empty_repo"
    empty_dir.mkdir(parents=True, exist_ok=True)
    git.Repo.init(empty_dir)

    with pytest.raises(EmptyRepoError):
        ingestor.ingest(empty_dir.as_uri())


def test_invalid_url_raises_error(ingestor):
    """Nonexistent/invalid URL should raise RepoAccessError or InvalidRepoURLError."""
    with pytest.raises((RepoAccessError, InvalidRepoURLError)):
        ingestor.ingest("https://github.com/nonexistent_org_xyz123_456/private_repo_99999.git")
