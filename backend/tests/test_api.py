"""Integration tests for FastAPI endpoints in backend."""

import shutil
import tempfile
from pathlib import Path

import git
import pytest
from fastapi.testclient import TestClient

from repopilot.api.routes import get_repo_ingestor
from repopilot.ingestion.clone import RepoIngestor
from repopilot.main import app


@pytest.fixture
def temp_dir():
    tmp = tempfile.mkdtemp()
    yield Path(tmp)
    shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture
def test_client(temp_dir):
    """FastAPI TestClient with isolated temporary RepoIngestor storage."""
    test_ingestor = RepoIngestor(base_storage_dir=temp_dir)
    app.dependency_overrides[get_repo_ingestor] = lambda: test_ingestor
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def test_root_and_health(test_client):
    """Verify system info and health check."""
    r_root = test_client.get("/")
    assert r_root.status_code == 200
    assert r_root.json()["status"] == "online"

    r_health = test_client.get("/health")
    assert r_health.status_code == 200
    assert r_health.json()["status"] == "healthy"


def test_post_repos_success(test_client, temp_dir):
    """Test POST /repos cloning a git repo, returning commit hash and filtered file count."""
    origin = temp_dir / "origin"
    origin.mkdir(parents=True, exist_ok=True)
    repo = git.Repo.init(origin)
    repo.config_writer().set_value("user", "name", "Tester").release()
    repo.config_writer().set_value("user", "email", "tester@test.local").release()

    (origin / "index.js").write_text("console.log('hi');", encoding="utf-8")
    (origin / "package-lock.json").write_text("{}", encoding="utf-8")
    repo.index.add(["index.js", "package-lock.json"])
    commit = repo.index.commit("Initial commit")

    response = test_client.post("/repos", json={"repo_url": origin.as_uri()})

    assert response.status_code == 200
    data = response.json()
    assert data["commit_hash"] == commit.hexsha
    assert data["file_count"] == 1
    assert data["files"][0]["path"] == "index.js"
    assert data["repo_id"] == RepoIngestor.compute_repo_id(origin.as_uri())


def test_post_repos_invalid_url(test_client):
    """Test POST /repos with an invalid protocol/schema returns 422 or 400."""
    response = test_client.post("/repos", json={"repo_url": "not-a-valid-url"})
    assert response.status_code == 422


def test_post_repos_empty_repo(test_client, temp_dir):
    """Test POST /repos with an empty repository returns 400 Bad Request."""
    empty_origin = temp_dir / "empty_origin"
    empty_origin.mkdir(parents=True, exist_ok=True)
    git.Repo.init(empty_origin)

    response = test_client.post("/repos", json={"repo_url": empty_origin.as_uri()})
    assert response.status_code == 400
    assert "no commits" in response.json()["detail"].lower()


def test_post_repos_nonexistent_remote(test_client):
    """Test POST /repos with a nonexistent remote repo returns 404."""
    response = test_client.post(
        "/repos",
        json={"repo_url": "https://github.com/000-nonexistent-org/repo-not-found-xyz.git"},
    )
    assert response.status_code in (404, 400)


def test_get_repos_and_file_content(test_client, temp_dir):
    """Test GET /repos lists cloned repos and GET /repos/{id}/file reads code slices."""
    origin = temp_dir / "origin"
    origin.mkdir(parents=True, exist_ok=True)
    repo = git.Repo.init(origin)
    repo.config_writer().set_value("user", "name", "Tester").release()
    repo.config_writer().set_value("user", "email", "tester@test.local").release()

    (origin / "hello.py").write_text("print('line 1')\nprint('line 2')\nprint('line 3')\n", encoding="utf-8")
    repo.index.add(["hello.py"])
    repo.index.commit("Add hello.py")

    # Ingest repo
    post_res = test_client.post("/repos", json={"repo_url": origin.as_uri()})
    assert post_res.status_code == 200
    repo_id = post_res.json()["repo_id"]

    # Test GET /repos
    get_res = test_client.get("/repos")
    assert get_res.status_code == 200
    repos = get_res.json()
    assert len(repos) >= 1
    found = next((r for r in repos if r["repo_id"] == repo_id), None)
    assert found is not None
    assert found["file_count"] == 1

    # Test GET /repos/{repo_id}/file
    file_res = test_client.get(f"/repos/{repo_id}/file?file_path=hello.py&start_line=1&end_line=2")
    assert file_res.status_code == 200
    file_data = file_res.json()
    assert file_data["start_line"] == 1
    assert file_data["end_line"] == 2
    assert "print('line 1')" in file_data["content"]
    assert "print('line 2')" in file_data["content"]
    assert "print('line 3')" not in file_data["content"]


def test_ask_stream_endpoint(test_client, temp_dir):
    """Test POST /repos/{repo_id}/ask/stream returns Server-Sent Events."""
    origin = temp_dir / "origin"
    origin.mkdir(parents=True, exist_ok=True)
    repo = git.Repo.init(origin)
    repo.config_writer().set_value("user", "name", "Tester").release()
    repo.config_writer().set_value("user", "email", "tester@test.local").release()

    (origin / "main.py").write_text("def hello():\n    return 42\n", encoding="utf-8")
    repo.index.add(["main.py"])
    repo.index.commit("Initial commit")

    post_res = test_client.post("/repos", json={"repo_url": origin.as_uri()})
    repo_id = post_res.json()["repo_id"]

    # Stream query
    stream_res = test_client.post(
        f"/repos/{repo_id}/ask/stream",
        json={"query": "Where is hello defined?", "model_provider": "mock", "max_steps": 2},
    )
    assert stream_res.status_code == 200
    assert "text/event-stream" in stream_res.headers.get("content-type", "")
    content = stream_res.text
    assert "event: " in content
    assert "data: " in content

