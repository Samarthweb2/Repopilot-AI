# Repopilot AI - REST API Reference

The Repopilot AI backend exposes a REST API powered by FastAPI.

- **Base URL**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

---

## Endpoints

### 1. Ingest Repository

#### `POST /repos`
Clones a new Git repository or syncs an existing repository to the latest commit, indexes all valid code files, and returns metadata.

##### Request Body
| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `repo_url` | string | Yes | — | Git repository URL (`https://`, `git@`, or `file://`) |
| `branch` | string | No | `null` | Target branch name to checkout |

**Example Request**:
```json
{
  "repo_url": "https://github.com/octocat/Hello-World.git",
  "branch": "master"
}
```

##### Response `200 OK`
```json
{
  "repo_id": "7a3560b41cf1",
  "url": "https://github.com/octocat/Hello-World.git",
  "branch": "master",
  "commit_hash": "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d",
  "file_count": 1,
  "files": [
    {
      "path": "README",
      "extension": "",
      "size": 13
    }
  ]
}
```

##### Error Responses
- **`400 Bad Request`**:
  - Invalid URL syntax or unsupported protocol.
  - Repository contains no commits / empty repository.
  ```json
  {
    "detail": "Repository has no commits."
  }
  ```
- **`404 Not Found`**:
  - Remote repository does not exist, host is unreachable, or authentication is required for a private repository.
  ```json
  {
    "detail": "Repository not found or network host unreachable: https://github.com/nonexistent/repo.git"
  }
  ```
- **`500 Internal Server Error`**:
  - Unexpected server error during cloning or tree walking.

---

### 2. Index Repository into Vector Store

#### `POST /repos/{repo_id}/index`
Explicit action to parse AST symbols via `CodeParser`, extract `CodeChunk` objects, and batch-embed them into ChromaDB.
Skips re-indexing if `commit_hash` has not changed since the last run.

##### Query Parameters
| Parameter | Type | Default | Description |
|---|---|---|---|
| `force` | boolean | `false` | If true, forces re-indexing even if `commit_hash` matches. |

##### Response `200 OK` (New Index)
```json
{
  "repo_id": "01b6ebe1df33",
  "commit_hash": "077f077ddec3f0e091355400da3ad61d4b1e1a9b",
  "status": "indexed",
  "chunks_count": 42,
  "symbols_count": 35,
  "skipped": false,
  "message": "Successfully indexed 42 chunks for repository 01b6ebe1df33."
}
```

##### Response `200 OK` (Cache Hit / Skipped)
```json
{
  "repo_id": "01b6ebe1df33",
  "commit_hash": "077f077ddec3f0e091355400da3ad61d4b1e1a9b",
  "status": "skipped",
  "chunks_count": 0,
  "symbols_count": 0,
  "skipped": true,
  "message": "Repository 01b6ebe1df33 is already indexed at commit 077f077ddec3f0e091355400da3ad61d4b1e1a9b."
}
```

---

### 3. Semantic Code Search

#### `GET /repos/{repo_id}/search`
Performs semantic similarity search over code chunks, strictly scoped to `repo_id`.

##### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | Yes | — | Natural language question or concept (e.g. "where do we handle payment retries") |
| `limit` | integer | No | `5` | Maximum number of matched chunks (1–50) |

##### Response `200 OK`
```json
[
  {
    "file_path": "billing/retry.py",
    "start_line": 14,
    "end_line": 38,
    "symbol_name": "handle_payment_retry",
    "symbol_type": "function",
    "parent_symbol": "PaymentService",
    "docstring": "Retries failed credit card transactions with exponential backoff.",
    "raw_code": "def handle_payment_retry(invoice_id): ...",
    "score": 0.8842,
    "repo_id": "01b6ebe1df33"
  }
]
```

---

### 4. Autonomous Agent Investigation & Answer Synthesis

#### `POST /repos/{repo_id}/ask`
Executes an autonomous ReAct investigation loop. The agent semantically searches code, looks up AST symbols, reads precise source lines from disk, and synthesizes an authoritative answer backed by verifiable code evidence citations.

##### Request Body
| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | Yes | — | Natural language or technical question about the repository |
| `max_steps` | integer | No | `6` | Maximum investigation steps before forcing synthesis (1–15) |
| `model_provider` | string | No | `null` | LLM provider override (`"gemini"`, `"openai"`, `"mock"`) |
| `model_name` | string | No | `null` | Specific model identifier (e.g. `"gemini-2.5-flash"`, `"gpt-4o-mini"`) |

**Example Request**:
```json
{
  "query": "Where is request timeout or retry handled?",
  "max_steps": 6,
  "model_provider": "gemini"
}
```

##### Response `200 OK`
```json
{
  "repo_id": "2652ff29a355",
  "query": "Where is request timeout or retry handled?",
  "completed": true,
  "total_steps": 2,
  "answer": "Connection timeouts and retries are managed by `HTTPAdapter` and `ConnectTimeout`...",
  "steps": [
    {
      "step_number": 1,
      "thought": "I will search the codebase to identify relevant code chunks.",
      "tool_name": "search_code",
      "tool_input": {
        "query": "Where is request timeout or retry handled?",
        "limit": 3
      },
      "observation": "Found 3 relevant code chunk(s)..."
    },
    {
      "step_number": 2,
      "thought": "Examining src/requests/exceptions.py in detail to verify the exact logic.",
      "tool_name": "read_file_slice",
      "tool_input": {
        "file_path": "src/requests/exceptions.py",
        "start_line": 91,
        "end_line": 95
      },
      "observation": "File: src/requests/exceptions.py (lines 91-95 of 162):\n  91 | class ConnectTimeout(ConnectionError, Timeout):..."
    }
  ],
  "evidence": [
    {
      "file_path": "src/requests/exceptions.py",
      "start_line": 91,
      "end_line": 95,
      "symbol_name": null,
      "code_snippet": "class ConnectTimeout(ConnectionError, Timeout):\n    \"\"\"The request timed out while trying to connect to the remote server.\n\n    Requests that produced this error are safe to retry.\n    \"\"\"",
      "relevance_explanation": "Inspected in Step 2 to verify logic."
    }
  ]
}
```

---

### 5. System Status & Health

#### `GET /`
Returns service identifier, status, and links to documentation.

#### `GET /health`
Liveness and readiness check.
```json
{
  "status": "healthy"
}
```
