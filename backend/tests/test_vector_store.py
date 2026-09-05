"""Unit and integration tests for ChromaVectorStore, Embedder, and Search API."""

import shutil
import tempfile
from pathlib import Path

import git
import pytest
from fastapi.testclient import TestClient

from repopilot.api.routes import get_code_parser, get_repo_ingestor, get_vector_store
from repopilot.indexing.embedder import MockEmbedder, prepare_chunk_text
from repopilot.indexing.models import CodeChunk
from repopilot.indexing.parser import CodeParser
from repopilot.indexing.vector_store import ChromaVectorStore
from repopilot.ingestion.clone import RepoIngestor
from repopilot.main import app


@pytest.fixture
def temp_dir():
    """Create isolated temporary directory for test repos and vector store."""
    tmp = tempfile.mkdtemp()
    yield Path(tmp)
    shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture
def mock_embedder():
    return MockEmbedder(dimension=128)


@pytest.fixture
def vector_store(temp_dir, mock_embedder):
    chroma_dir = temp_dir / ".chromadb"
    return ChromaVectorStore(persist_dir=chroma_dir, embedder=mock_embedder)


def test_prepare_chunk_text_and_truncation():
    """Verify enriched chunk header formatting and safe size truncation."""
    chunk = CodeChunk(
        file_path="src/payment.py",
        start_line=10,
        end_line=25,
        symbol_name="retry_payment",
        symbol_type="function",
        parent_symbol="PaymentService",
        docstring="Retries payment on network timeouts.",
        raw_code="def retry_payment(): pass",
    )

    text, is_truncated = prepare_chunk_text(chunk, max_chars=500)
    assert "# Symbol: retry_payment (function)" in text
    assert "# File: src/payment.py:10-25" in text
    assert "# Parent: PaymentService" in text
    assert "# Description:\nRetries payment on network timeouts." in text
    assert "def retry_payment(): pass" in text
    assert not is_truncated

    # Test truncation on large chunk
    huge_code = "x = 1\n" * 1000
    huge_chunk = CodeChunk(
        file_path="huge.py",
        start_line=1,
        end_line=1000,
        symbol_name="huge_func",
        symbol_type="function",
        raw_code=huge_code,
    )
    truncated_text, is_truncated_flag = prepare_chunk_text(huge_chunk, max_chars=100)
    assert is_truncated_flag
    assert len(truncated_text) < 200
    assert "[TRUNCATED DUE TO SIZE LIMIT]" in truncated_text


def test_mock_embedder():
    """Verify MockEmbedder outputs normalized vectors of exact dimension."""
    embedder = MockEmbedder(dimension=128)
    v1 = embedder.embed_query("payment retry logic")
    v2 = embedder.embed_query("payment retry logic")
    v3 = embedder.embed_query("user authentication jwt")

    assert len(v1) == 128
    assert v1 == v2  # Deterministic
    assert v1 != v3  # Distinct text produces distinct vector


def test_vector_store_indexing_and_search(vector_store):
    """Verify indexing chunks, natural-language search, and score calculation."""
    chunks = [
        CodeChunk(
            file_path="auth/jwt.py",
            start_line=1,
            end_line=20,
            symbol_name="validate_token",
            symbol_type="function",
            docstring="Validates user authentication bearer token and checks expiration.",
            raw_code="def validate_token(token): return True",
        ),
        CodeChunk(
            file_path="billing/retry.py",
            start_line=1,
            end_line=30,
            symbol_name="handle_payment_retry",
            symbol_type="function",
            docstring="Retries failed credit card transactions with exponential backoff.",
            raw_code="def handle_payment_retry(invoice_id): retry()",
        ),
    ]

    res = vector_store.index_repository(
        repo_id="repo_1",
        commit_hash="commit_aaa",
        chunks=chunks,
    )
    assert res.status == "indexed"
    assert res.chunks_count == 2
    assert not res.skipped

    # Search for payment retry
    search_results = vector_store.search(
        query="handle payment retry transactions",
        repo_id="repo_1",
        limit=2,
    )
    assert len(search_results) >= 1
    top = search_results[0]
    assert top.symbol_name == "handle_payment_retry"
    assert top.file_path == "billing/retry.py"
    assert top.score > 0.0


def test_repo_scoping_isolation(vector_store):
    """Verify searches strictly filter by repo_id."""
    chunk_a = CodeChunk(
        file_path="secret_a.py",
        start_line=1,
        end_line=10,
        symbol_name="secret_function_a",
        symbol_type="function",
        raw_code="def secret_function_a(): pass",
    )
    chunk_b = CodeChunk(
        file_path="secret_b.py",
        start_line=1,
        end_line=10,
        symbol_name="secret_function_b",
        symbol_type="function",
        raw_code="def secret_function_b(): pass",
    )

    vector_store.index_repository("repo_A", "hash_1", [chunk_a])
    vector_store.index_repository("repo_B", "hash_2", [chunk_b])

    # Search scoped to repo_A
    results_a = vector_store.search("secret", repo_id="repo_A")
    assert all(r.repo_id == "repo_A" for r in results_a)
    assert any(r.symbol_name == "secret_function_a" for r in results_a)
    assert not any(r.symbol_name == "secret_function_b" for r in results_a)

    # Search scoped to repo_B
    results_b = vector_store.search("secret", repo_id="repo_B")
    assert all(r.repo_id == "repo_B" for r in results_b)
    assert any(r.symbol_name == "secret_function_b" for r in results_b)
    assert not any(r.symbol_name == "secret_function_a" for r in results_b)


def test_commit_caching_and_reindexing(vector_store):
    """Verify unchanged commit_hash skips re-embedding, and new commit_hash replaces old vectors."""
    chunk_v1 = CodeChunk(
        file_path="main.py",
        start_line=1,
        end_line=10,
        symbol_name="v1_symbol",
        symbol_type="function",
        raw_code="def v1_symbol(): pass",
    )
    chunk_v2 = CodeChunk(
        file_path="main.py",
        start_line=1,
        end_line=12,
        symbol_name="v2_symbol",
        symbol_type="function",
        raw_code="def v2_symbol(): pass",
    )

    # 1. Initial indexing
    res1 = vector_store.index_repository("repo_test", "commit_v1", [chunk_v1])
    assert res1.status == "indexed"
    assert not res1.skipped

    # 2. Re-indexing at SAME commit -> skips
    res2 = vector_store.index_repository("repo_test", "commit_v1", [chunk_v1])
    assert res2.status == "skipped"
    assert res2.skipped

    # 3. Indexing at NEW commit -> replaces old vectors
    res3 = vector_store.index_repository("repo_test", "commit_v2", [chunk_v2])
    assert res3.status == "indexed"
    assert not res3.skipped

    # Verify only v2 exists
    search_res = vector_store.search("symbol", repo_id="repo_test")
    symbols = [s.symbol_name for s in search_res]
    assert "v2_symbol" in symbols
    assert "v1_symbol" not in symbols


def test_batch_indexing_large_volume(vector_store):
    """Verify batching works seamlessly when chunk count exceeds batch size (64)."""
    many_chunks = [
        CodeChunk(
            file_path=f"file_{i}.py",
            start_line=1,
            end_line=10,
            symbol_name=f"func_{i}",
            symbol_type="function",
            raw_code=f"def func_{i}(): return {i}",
        )
        for i in range(75)
    ]

    res = vector_store.index_repository("bulk_repo", "bulk_commit", many_chunks)
    assert res.status == "indexed"
    assert res.chunks_count == 75


def test_api_index_and_search_flow(temp_dir, mock_embedder):
    """Test FastAPI endpoints POST /repos/{repo_id}/index and GET /repos/{repo_id}/search."""
    repos_dir = temp_dir / "repos"
    repos_dir.mkdir(parents=True, exist_ok=True)
    chroma_dir = temp_dir / ".chromadb"

    ingestor = RepoIngestor(base_storage_dir=repos_dir)
    vector_store = ChromaVectorStore(persist_dir=chroma_dir, embedder=mock_embedder)
    parser = CodeParser()

    # Create a local Git repo
    origin = temp_dir / "git_origin"
    origin.mkdir()
    repo = git.Repo.init(origin)
    repo.config_writer().set_value("user", "name", "Test").release()
    repo.config_writer().set_value("user", "email", "test@test.local").release()

    (origin / "billing.py").write_text(
        "def process_charge():\n    '''Handles credit card charge.'''\n    pass\n",
        encoding="utf-8",
    )
    repo.index.add(["billing.py"])
    commit = repo.index.commit("Initial")

    # Dependency overrides
    app.dependency_overrides[get_repo_ingestor] = lambda: ingestor
    app.dependency_overrides[get_vector_store] = lambda: vector_store
    app.dependency_overrides[get_code_parser] = lambda: parser

    client = TestClient(app)

    # 1. First clone repo via POST /repos
    r_clone = client.post("/repos", json={"repo_url": origin.as_uri()})
    assert r_clone.status_code == 200
    repo_id = r_clone.json()["repo_id"]

    # 2. Trigger explicit index via POST /repos/{repo_id}/index
    r_index = client.post(f"/repos/{repo_id}/index")
    assert r_index.status_code == 200
    index_data = r_index.json()
    assert index_data["status"] == "indexed"
    assert index_data["commit_hash"] == commit.hexsha
    assert index_data["chunks_count"] >= 1

    # 3. Re-index without force -> returns skipped
    r_index2 = client.post(f"/repos/{repo_id}/index")
    assert r_index2.status_code == 200
    assert r_index2.json()["status"] == "skipped"

    # 4. Search via GET /repos/{repo_id}/search
    r_search = client.post if False else client.get(
        f"/repos/{repo_id}/search",
        params={"query": "credit card charge"},
    )
    assert r_search.status_code == 200
    search_data = r_search.json()
    assert len(search_data) >= 1
    match = search_data[0]
    assert match["symbol_name"] == "process_charge"
    assert match["file_path"] == "billing.py"
    assert match["repo_id"] == repo_id

    # 5. Search nonexistent repo -> 404
    r_404 = client.get("/repos/nonexistent_id_123/search", params={"query": "test"})
    assert r_404.status_code == 404

    app.dependency_overrides.clear()
