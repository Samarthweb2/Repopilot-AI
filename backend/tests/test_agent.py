"""Automated unit and integration tests for Phase 4: Agent Tools, ReAct Loop, and Ask API."""

import asyncio
import json
import shutil
import tempfile
from pathlib import Path
import git
import pytest
from fastapi.testclient import TestClient

from repopilot.agent.llm import LLMStepResult, MockLLMClient
from repopilot.agent.loop import AgentLoop
from repopilot.agent.models import QueryRequest, QueryResponse
from repopilot.api.routes import get_repo_ingestor, get_vector_store
from repopilot.indexing.embedder import MockEmbedder
from repopilot.indexing.models import CodeChunk, SearchResult, SymbolTable
from repopilot.indexing.vector_store import ChromaVectorStore
from repopilot.ingestion.clone import RepoIngestor
from repopilot.main import app
from repopilot.tools.code_tools import CodebaseTools


@pytest.fixture
def client():
    """FastAPI TestClient fixture."""
    return TestClient(app)



@pytest.fixture
def temp_repo_dir():
    """Create a temporary git repository with realistic code files for tool testing."""
    tmp_path = Path(tempfile.mkdtemp(prefix="repopilot_test_agent_"))
    git.Repo.init(tmp_path)

    # Create src/auth/service.py
    src_auth = tmp_path / "src" / "auth"
    src_auth.mkdir(parents=True, exist_ok=True)
    auth_code = """\"\"\"Authentication module.\"\"\"

class AuthService:
    \"\"\"Handles user authentication and token verification.\"\"\"

    def __init__(self, secret_key: str):
        self.secret_key = secret_key

    def validate_token(self, token: str) -> bool:
        \"\"\"Validates JWT signature and returns expiration status.\"\"\"
        if not token:
            return False
        return token.startswith("valid_")
"""
    (src_auth / "service.py").write_text(auth_code, encoding="utf-8")

    # Create README.md
    (tmp_path / "README.md").write_text("# Test Repo\n\nDocs for testing.", encoding="utf-8")

    repo = git.Repo(tmp_path)
    repo.index.add(["src/auth/service.py", "README.md"])
    repo.index.commit("Initial commit for agent tests")

    yield tmp_path
    shutil.rmtree(tmp_path, ignore_errors=True)


@pytest.fixture
def sample_symbol_table():
    """Create a sample SymbolTable with AuthService and validate_token."""
    st = SymbolTable()
    st.add(
        CodeChunk(
            file_path="src/auth/service.py",
            start_line=3,
            end_line=13,
            symbol_name="AuthService",
            symbol_type="class",
            docstring="Handles user authentication and token verification.",
            raw_code="class AuthService:\n    ...",
        )
    )
    st.add(
        CodeChunk(
            file_path="src/auth/service.py",
            start_line=8,
            end_line=13,
            symbol_name="validate_token",
            symbol_type="method",
            parent_symbol="AuthService",
            docstring="Validates JWT signature and returns expiration status.",
            raw_code="def validate_token(self, token: str) -> bool:\n    ...",
        )
    )
    return st


class MockVectorStore:
    """Mock vector store for deterministic tool tests."""

    def __init__(self):
        self.search_called_with = []

    def search(self, query: str, repo_id: str, limit: int = 5):
        self.search_called_with.append((query, repo_id, limit))
        if "auth" in query.lower() or "token" in query.lower():
            return [
                SearchResult(
                    file_path="src/auth/service.py",
                    start_line=8,
                    end_line=13,
                    symbol_name="validate_token",
                    symbol_type="method",
                    parent_symbol="AuthService",
                    docstring="Validates JWT signature and returns expiration status.",
                    raw_code="def validate_token(self, token: str) -> bool:\n    return token.startswith('valid_')",
                    score=0.92,
                    repo_id=repo_id,
                )
            ]
        return []


# ============================================================================
# 1. Tool Unit Tests
# ============================================================================

def test_tool_read_file_slice_valid(temp_repo_dir):
    """Assert read_file_slice extracts correct lines with 1-indexed numbering."""
    tools = CodebaseTools(repo_id="test_repo", target_dir=temp_repo_dir)
    result = tools.read_file_slice("src/auth/service.py", start_line=3, end_line=7)

    assert "File: src/auth/service.py (lines 3-7 of 13):" in result
    assert "3 | class AuthService:" in result
    assert "4 |     \"\"\"Handles user authentication and token verification.\"\"\"" in result


def test_tool_read_file_slice_bounds_and_safety(temp_repo_dir):
    """Assert read_file_slice prevents directory traversal and handles boundary conditions."""
    tools = CodebaseTools(repo_id="test_repo", target_dir=temp_repo_dir)

    # Path traversal attempt
    traversal_res = tools.read_file_slice("../../etc/passwd", 1, 10)
    assert "Error: Access denied" in traversal_res

    # Non-existent file
    missing_res = tools.read_file_slice("nonexistent.py", 1, 10)
    assert "Error: File 'nonexistent.py' does not exist" in missing_res

    # end_line < start_line
    invalid_range = tools.read_file_slice("src/auth/service.py", 10, 5)
    assert "Error: end_line (5) cannot be less than start_line (10)" in invalid_range

    # start_line beyond EOF
    eof_range = tools.read_file_slice("src/auth/service.py", 100, 110)
    assert "exceeds file length" in eof_range


def test_tool_lookup_symbol(temp_repo_dir, sample_symbol_table):
    """Assert lookup_symbol retrieves declarations from SymbolTable."""
    tools = CodebaseTools(
        repo_id="test_repo",
        target_dir=temp_repo_dir,
        symbol_table=sample_symbol_table,
    )

    # Exact lookup
    res_exact = tools.lookup_symbol("AuthService", exact=True)
    assert "Found 1 declaration(s) matching 'AuthService'" in res_exact
    assert "src/auth/service.py:3-13" in res_exact
    assert "Symbol: AuthService (class)" in res_exact

    # Substring search
    res_partial = tools.lookup_symbol("token", exact=False)
    assert "validate_token" in res_partial
    assert "parent: AuthService" in res_partial

    # Non-existent symbol
    res_missing = tools.lookup_symbol("NonExistentService")
    assert "No AST symbol matches found" in res_missing


def test_tool_search_code(temp_repo_dir):
    """Assert search_code formats vector store results cleanly."""
    mock_vs = MockVectorStore()
    tools = CodebaseTools(
        repo_id="test_repo",
        target_dir=temp_repo_dir,
        vector_store=mock_vs,
    )

    result = tools.search_code("validate user token", limit=3)
    assert "Found 1 relevant code chunk(s)" in result
    assert "validate_token" in result
    assert "Score: 0.920" in result
    assert "Docstring: Validates JWT signature" in result


def test_tool_list_directory(temp_repo_dir):
    """Assert list_directory explores repo structure and blocks traversal."""
    tools = CodebaseTools(repo_id="test_repo", target_dir=temp_repo_dir)

    root_listing = tools.list_directory("")
    assert "[DIR]  src/" in root_listing
    assert "[FILE] README.md" in root_listing

    sub_listing = tools.list_directory("src/auth")
    assert "[FILE] service.py" in sub_listing

    # Traversal protection
    traversal = tools.list_directory("../../")
    assert "Error: Access denied" in traversal


def test_tool_dispatch_execute(temp_repo_dir, sample_symbol_table):
    """Assert execute() method dispatches to correct tool or returns error."""
    mock_vs = MockVectorStore()
    tools = CodebaseTools(
        repo_id="test_repo",
        target_dir=temp_repo_dir,
        vector_store=mock_vs,
        symbol_table=sample_symbol_table,
    )

    res = tools.execute("lookup_symbol", {"symbol_name": "AuthService", "exact": True})
    assert "AuthService" in res

    bad_tool = tools.execute("unsupported_tool", {})
    assert "Error: Unknown tool 'unsupported_tool'" in bad_tool


# ============================================================================
# 2. AgentLoop Tests
# ============================================================================

def test_agent_loop_scripted_flow(temp_repo_dir, sample_symbol_table):
    """Assert agent executes multi-step investigation, extracts evidence, and answers."""
    mock_vs = MockVectorStore()
    tools = CodebaseTools(
        repo_id="test_repo",
        target_dir=temp_repo_dir,
        vector_store=mock_vs,
        symbol_table=sample_symbol_table,
    )

    # Scripted 3-step LLM response:
    # Step 1: Call search_code
    # Step 2: Call read_file_slice on src/auth/service.py
    # Step 3: Produce final answer
    scripted = [
        LLMStepResult(
            content="I will search for token validation logic.",
            is_tool_call=True,
            tool_name="search_code",
            tool_args={"query": "token validation", "limit": 2},
        ),
        LLMStepResult(
            content="Now I will inspect the validate_token method implementation.",
            is_tool_call=True,
            tool_name="read_file_slice",
            tool_args={
                "file_path": "src/auth/service.py",
                "start_line": 8,
                "end_line": 13,
            },
        ),
        LLMStepResult(
            content=(
                "Token validation is implemented in `AuthService.validate_token` located at "
                "`src/auth/service.py:8-13`. It checks if the token starts with 'valid_'."
            ),
            is_tool_call=False,
            finish_reason="stop",
        ),
    ]

    llm_client = MockLLMClient(scripted_steps=scripted)
    agent = AgentLoop(
        repo_id="test_repo",
        target_dir=temp_repo_dir,
        tools=tools,
        llm_client=llm_client,
    )

    response: QueryResponse = asyncio.run(
        agent.run("Where is token validation implemented?", max_steps=5)
    )

    assert response.completed is True
    assert response.total_steps == 2
    assert len(response.steps) == 2
    assert response.steps[0].tool_name == "search_code"
    assert response.steps[1].tool_name == "read_file_slice"
    assert "AuthService.validate_token" in response.answer

    # Assert verifiable evidence was extracted
    assert len(response.evidence) >= 1
    ev = response.evidence[0]
    assert ev.file_path == "src/auth/service.py"
    assert ev.start_line == 8
    assert ev.end_line == 13
    assert "def validate_token" in ev.code_snippet


def test_agent_loop_max_steps_ceiling(temp_repo_dir):
    """Assert loop terminates gracefully when max_steps is reached without infinite recursion."""
    tools = CodebaseTools(repo_id="test_repo", target_dir=temp_repo_dir)

    # LLM that keeps calling tools forever
    class InfiniteToolLLM(MockLLMClient):
        async def generate_step(self, messages, tools):
            last = messages[-1] if messages else {}
            if "maximum allocated investigation steps" in str(last.get("content", "")):
                return LLMStepResult(
                    content="Synthesized summary after hitting step limit.",
                    is_tool_call=False,
                )
            return LLMStepResult(
                content="Calling tool again...",
                is_tool_call=True,
                tool_name="list_directory",
                tool_args={"directory": ""},
            )

    llm = InfiniteToolLLM()
    agent = AgentLoop(repo_id="test_repo", target_dir=temp_repo_dir, tools=tools, llm_client=llm)

    response = asyncio.run(agent.run("Explore forever", max_steps=3))

    assert response.total_steps == 3
    assert response.completed is False
    assert "Synthesized summary after hitting step limit." in response.answer


# ============================================================================
# 3. API Integration Test (POST /repos/{repo_id}/ask)
# ============================================================================

def test_api_ask_not_found(client):
    """Assert POST /repos/{repo_id}/ask returns 404 for un-cloned repos."""
    resp = client.post(
        "/repos/nonexistent123/ask",
        json={"query": "How does auth work?"},
    )
    assert resp.status_code == 404
    assert "not found locally" in resp.json()["detail"]


def test_api_ask_end_to_end(client, tmp_path, monkeypatch):
    """Assert POST /repos/{repo_id}/ask completes end-to-end with mock LLM."""
    test_repos_dir = tmp_path / "repos"
    test_chroma_dir = tmp_path / "chromadb"
    test_repos_dir.mkdir()
    test_chroma_dir.mkdir()

    ingestor = RepoIngestor(base_storage_dir=test_repos_dir)
    vector_store = ChromaVectorStore(
        persist_dir=str(test_chroma_dir),
        embedder=MockEmbedder(),
    )

    app.dependency_overrides[get_repo_ingestor] = lambda: ingestor
    app.dependency_overrides[get_vector_store] = lambda: vector_store

    try:
        # Create small git repo
        source_dir = tmp_path / "source_repo"
        source_dir.mkdir()
        git.Repo.init(source_dir)
        (source_dir / "calc.py").write_text(
            "def add(a, b):\n    '''Add numbers.'''\n    return a + b\n",
            encoding="utf-8",
        )
        r = git.Repo(source_dir)
        r.index.add(["calc.py"])
        r.index.commit("Initial commit")

        # Ingest and index
        post_resp = client.post("/repos", json={"repo_url": source_dir.as_uri()})
        assert post_resp.status_code == 200
        repo_id = post_resp.json()["repo_id"]

        idx_resp = client.post(f"/repos/{repo_id}/index")
        assert idx_resp.status_code == 200

        # Ask question
        ask_resp = client.post(
            f"/repos/{repo_id}/ask",
            json={
                "query": "Where is the add function implemented?",
                "max_steps": 4,
                "model_provider": "mock",
            },
        )
        assert ask_resp.status_code == 200
        data = ask_resp.json()

        assert data["repo_id"] == repo_id
        assert data["query"] == "Where is the add function implemented?"
        assert data["answer"]
        assert len(data["steps"]) >= 1
        assert data["total_steps"] >= 1
        assert isinstance(data["evidence"], list)

    finally:
        app.dependency_overrides.clear()


def test_tool_get_references_multiple_callers(tmp_path):
    """Test get_references discovers call-sites across multiple callers without counting definition."""
    auth_dir = tmp_path / "src" / "auth"
    api_dir = tmp_path / "src" / "api"
    auth_dir.mkdir(parents=True, exist_ok=True)
    api_dir.mkdir(parents=True, exist_ok=True)

    auth_code = (
        "\"\"\"Auth module.\"\"\"\n\n"
        "def authenticate_user(token: str) -> bool:\n"
        "    \"\"\"Check credentials.\"\"\"\n"
        "    return token == 'valid'\n"
    )
    (auth_dir / "service.py").write_text(auth_code, encoding="utf-8")

    routes_code = (
        "\"\"\"Routes module.\"\"\"\n"
        "from src.auth.service import authenticate_user\n\n"
        "def login_handler(request):\n"
        "    \"\"\"Handle login.\"\"\"\n"
        "    ok = authenticate_user(request.token)\n"
        "    return {'status': ok}\n\n"
        "def refresh_handler(request):\n"
        "    \"\"\"Handle token refresh.\"\"\"\n"
        "    if authenticate_user(request.token):\n"
        "        return {'token': 'new'}\n"
        "    return {'error': 'unauthorized'}\n"
    )
    (api_dir / "routes.py").write_text(routes_code, encoding="utf-8")

    from repopilot.indexing.parser import CodeParser

    parser = CodeParser()
    ingestor = RepoIngestor()
    files = ingestor.walk_and_filter(tmp_path)
    chunks, st = parser.parse_repo(tmp_path, files)

    tools = CodebaseTools(repo_id="test_ref_repo", target_dir=tmp_path, symbol_table=st)

    # 1. Look up authenticate_user references
    result = tools.get_references("authenticate_user")

    assert "Found 2 reference(s) to 'authenticate_user'" in result
    assert "login_handler" in result
    assert "refresh_handler" in result
    assert "src/api/routes.py" in result
    # The definition line inside service.py should NOT be counted as a reference
    assert "def authenticate_user" not in result

    # 2. Error handling and unknown symbols
    assert tools.get_references("") == "Error: symbol_name cannot be empty."
    assert "No call-site references found" in tools.get_references("unknown_function_xyz")


def test_tool_git_blame_commit_metadata(tmp_path):
    """Test git_blame returns commit hash, author, date, and commit message per line."""
    repo = git.Repo.init(tmp_path)
    config_file = tmp_path / "config.py"

    # Commit 1 by Alice
    config_file.write_text(
        "# Server Configuration\nPORT = 8080\nDEBUG = True\n",
        encoding="utf-8",
    )
    repo.index.add(["config.py"])
    author_alice = git.Actor("Alice", "alice@example.com")
    repo.index.commit("Initial server configuration", author=author_alice, committer=author_alice)

    # Commit 2 by Bob
    config_file.write_text(
        "# Server Configuration\nPORT = 8080\nDEBUG = True\nTIMEOUT = 60\nRETRIES = 5\n",
        encoding="utf-8",
    )
    repo.index.add(["config.py"])
    author_bob = git.Actor("Bob", "bob@example.com")
    repo.index.commit("Add timeout and retry limits", author=author_bob, committer=author_bob)

    tools = CodebaseTools(repo_id="test_blame_repo", target_dir=tmp_path)

    # Blame lines 1 through 5
    blame_res = tools.git_blame("config.py", start_line=1, end_line=5)

    assert "Git blame for 'config.py' (lines 1-5)" in blame_res
    assert "Alice" in blame_res
    assert "Bob" in blame_res
    assert "Initial server configuration" in blame_res
    assert "Add timeout and retry limits" in blame_res
    assert "PORT = 8080" in blame_res
    assert "RETRIES = 5" in blame_res

    # Test error and security cases
    traversal_err = tools.git_blame("../outside.py", 1, 10)
    assert "Error: Access denied" in traversal_err

    missing_err = tools.git_blame("nonexistent.py", 1, 10)
    assert "does not exist in repository" in missing_err

    invalid_range = tools.git_blame("config.py", 10, 5)
    assert "cannot be less than start_line" in invalid_range


def test_tool_grep_cap_and_path_guards(tmp_path):
    """Test grep respects 50 results cap, path traversal guards, and file globs."""
    # Create file with 65 matching lines
    target_file = tmp_path / "data.py"
    lines = [f"item_{i} = 'PAYLOAD_FLAG_{i}'" for i in range(65)]
    target_file.write_text("\n".join(lines), encoding="utf-8")

    # Create secret file
    secret_file = tmp_path / "secret.env"
    secret_file.write_text("API_SECRET_TOKEN=xyz987\n", encoding="utf-8")

    tools = CodebaseTools(repo_id="test_grep_repo", target_dir=tmp_path)

    # 1. Path traversal in file_glob must be blocked
    traversal_res = tools.grep("PAYLOAD_FLAG", file_glob="../**")
    assert "Error: Access denied" in traversal_res

    traversal_res2 = tools.grep("PAYLOAD_FLAG", file_glob="/etc/*")
    assert "Error: Access denied" in traversal_res2

    # 2. Results capped at 50
    cap_res = tools.grep("PAYLOAD_FLAG")
    assert "Found 50 match(es)" in cap_res
    assert "Results capped at 50 matches" in cap_res

    # 3. File glob filtering
    glob_res = tools.grep("API_SECRET_TOKEN", file_glob="*.env")
    assert "Found 1 match(es)" in glob_res
    assert "API_SECRET_TOKEN=xyz987" in glob_res

    no_glob_match = tools.grep("API_SECRET_TOKEN", file_glob="*.py")
    assert "No matches found" in no_glob_match

    # 4. Empty pattern
    assert tools.grep("") == "Error: pattern cannot be empty."


def test_synthesis_per_claim_citation_granularity(tmp_path):
    """Test that final synthesis produces per-claim citations narrower than the investigated slices."""
    # Create a 60-line source file
    service_code = [
        "\"\"\"Transaction processing service.\"\"\"",
        "import hashlib",
        "import os",
        "import sys",
    ]
    # Lines 5 to 20: boilerplate
    for i in range(5, 21):
        service_code.append(f"# Boilerplate setup line {i}")

    # Lines 21 to 25: critical assertion lines
    service_code.extend([
        "def verify_checksum(payload: bytes, expected_hash: str) -> bool:",
        "    \"\"\"Verify SHA-256 payload integrity.\"\"\"",
        "    computed = hashlib.sha256(payload).hexdigest()",
        "    return computed == expected_hash",
    ])

    # Lines 26 to 60: post-processing
    for i in range(26, 61):
        service_code.append(f"# Post-processing routine line {i}")

    svc_path = tmp_path / "service.py"
    svc_path.write_text("\n".join(service_code), encoding="utf-8")

    # Mock an investigation where read_file_slice investigated lines 1 to 50 (50 lines broad)
    # and the model synthesized a specific per-claim citation for lines 21 to 24 (4 lines narrow).
    scripted_client = MockLLMClient()
    # Step 1: Tool call reading lines 1 to 50
    scripted_client.add_step(
        LLMStepResult(
            content="I need to inspect the service implementation.",
            is_tool_call=True,
            tool_name="read_file_slice",
            tool_args={"file_path": "service.py", "start_line": 1, "end_line": 50},
        )
    )
    # Step 2: Final synthesis with a narrow per-claim citation (lines 21-24)
    citations_block = json.dumps(
        [
            {
                "file_path": "service.py",
                "start_line": 21,
                "end_line": 24,
                "claim": "Payload integrity is verified by comparing the computed SHA-256 digest with expected_hash.",
                "symbol_name": "verify_checksum",
            }
        ]
    )
    scripted_client.add_step(
        LLMStepResult(
            content=(
                "Based on the repository investigation:\n\n"
                "The verify_checksum function validates payloads using SHA-256 digests.\n\n"
                f"```citations\n{citations_block}\n```"
            ),
            is_tool_call=False,
            finish_reason="stop",
        )
    )

    tools = CodebaseTools(repo_id="test_granularity_repo", target_dir=tmp_path)
    agent = AgentLoop(
        repo_id="test_granularity_repo",
        target_dir=tmp_path,
        tools=tools,
        llm_client=scripted_client,
    )

    response = asyncio.run(agent.run(query="How is payload integrity verified?", max_steps=4))

    assert response.completed is True
    assert len(response.evidence) == 1

    ev = response.evidence[0]
    assert ev.file_path == "service.py"
    assert ev.start_line == 21
    assert ev.end_line == 24
    assert ev.claim == "Payload integrity is verified by comparing the computed SHA-256 digest with expected_hash."
    assert "verify_checksum" in ev.code_snippet
    assert "hashlib.sha256" in ev.code_snippet

    # Verify granularity: cited span is strictly narrower than the investigated tool slice
    investigated_slice_span = 50 - 1 + 1  # 50 lines
    cited_span = ev.end_line - ev.start_line + 1  # 4 lines
    assert cited_span < investigated_slice_span
    assert cited_span <= 10

    # Verify that raw JSON citations block was stripped from clean answer
    assert "```citations" not in response.answer
    assert "The verify_checksum function validates payloads using SHA-256 digests." in response.answer

