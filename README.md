# Repopilot AI

Repopilot AI is an autonomous codebase intelligence and investigation engine. It connects to Git repositories, parses source code into Abstract Syntax Tree (AST) symbols, indexes code chunks into vector embeddings, and executes a multi-step autonomous agent loop to answer complex technical questions backed by verifiable source code citations.

---

## System Architecture

The system operates across four coordinated stages:

1. **Phase 1: Ingestion and Filtering**
   - Clones or updates Git repositories over HTTPS, SSH, or local file URIs.
   - Computes a deterministic 12-character SHA-256 repository identifier.
   - Filters out non-code assets, lockfiles, minified files, vendor dependencies, and files exceeding 2MB.

2. **Phase 2: AST Parsing and Symbol Indexing**
   - Parses Python, JavaScript, and TypeScript files using Tree-sitter.
   - Extracts semantic units (functions, classes, methods) rather than arbitrary line slices.
   - Extracts docstrings, JSDoc comments, parameter context, and enclosing parent symbols.
   - Builds a multi-map SymbolTable for fast exact and substring identifier lookups.
   - Gracefully handles non-code documentation files with section chunking.

3. **Phase 3: Semantic Search and Vector Storage**
   - Prepares context-enriched chunk texts combining file path, symbol identity, docstrings, and code.
   - Generates dense vector embeddings using pluggable providers (OpenAI, Voyage, local ONNX, or Mock).
   - Stores and searches vectors using a persistent ChromaDB instance with repository scoping.
   - Employs commit-hash caching to skip re-indexing unchanged repositories.

4. **Phase 4: Autonomous Agent and Evidence Synthesis**
   - Orchestrates a ReAct (Reasoning and Acting) investigation loop with multi-tool calling.
   - Equips the agent with seven tools: `search_code`, `lookup_symbol`, `read_file_slice`, `list_directory`, `get_references`, `git_blame`, and `grep`.
   - Protects against directory traversal and limits file slice sizes.
   - Enforces a hard step limit to prevent infinite loops.
   - Extracts structured per-claim evidence citations with narrow line ranges directly from verified source files on disk.
   - Supports real-time Server-Sent Events (SSE) streaming for live step-by-step UI updates.

---

## Directory Structure

```
Repopilot-AI/
├── backend/
│   ├── pyproject.toml         # Backend package specifications and dependencies
│   ├── repopilot/
│   │   ├── main.py            # FastAPI application entrypoint
│   │   ├── api/
│   │   │   └── routes.py      # REST & SSE streaming API route handlers
│   │   ├── ingestion/
│   │   │   └── clone.py       # Git cloning, syncing, and file filtering
│   │   ├── indexing/
│   │   │   ├── parser.py      # Tree-sitter AST parser
│   │   │   ├── embedder.py    # Embedding model abstractions and providers
│   │   │   ├── vector_store.py# ChromaDB persistence, batching, and search
│   │   │   └── models.py      # AST models, CodeChunk, SymbolTable
│   │   ├── tools/
│   │   │   ├── code_tools.py  # Codebase inspection tools and schemas
│   │   │   └── __init__.py    # Tools exports
│   │   ├── agent/
│   │   │   ├── loop.py        # Autonomous ReAct agent loop (sync & SSE streaming)
│   │   │   ├── llm.py         # Multi-provider LLM clients (Gemini, OpenAI, Mock)
│   │   │   ├── models.py      # AgentStep, EvidenceCitation, Query schemas
│   │   │   └── __init__.py    # Agent exports
│   │   └── models/
│   │       └── schemas.py     # API request and response schemas
│   └── tests/
│       ├── test_api.py        # API health, repos listing, and streaming tests
│       ├── test_ingestion.py  # Git cloning and filtering tests
│       ├── test_parser.py     # AST parsing and symbol table tests
│       ├── test_vector_store.py # ChromaDB and embedding tests
│       └── test_agent.py      # Tool, loop, and ask endpoint tests
├── frontend/                  # React + Vite + Tailwind web application
│   ├── src/
│   │   ├── components/        # Header, CodeViewer, and UI components
│   │   ├── views/             # ConnectRepoView, DashboardView, AskView
│   │   ├── lib/               # API client and SSE streaming handler
│   │   └── types/             # TypeScript definitions
│   ├── package.json
│   └── vite.config.ts
├── render.yaml                # Render Blueprint deployment specification
├── documentation/             # Detailed architecture and API references
└── requirements.txt           # Unified dependency listing
```

---

## Installation and Setup

### Prerequisites

- Python 3.10 or higher (Python 3.11 or 3.12 recommended)
- Node.js 18 or higher (for frontend development)
- Git installed and available on PATH

### 1. Set Up Backend Virtual Environment

```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On Linux / macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install -e backend
```

### 2. Set Up Frontend

```bash
cd frontend
npm install
cd ..
```

---

## Running Locally

### 1. Run Backend Server

```bash
# From workspace root with activated virtual environment
uvicorn repopilot.main:app --reload --port 8000
```

- API Base URL: `http://localhost:8000`
- Interactive Swagger Docs: `http://localhost:8000/docs`
- Service Health: `http://localhost:8000/health`

### 2. Run Frontend Web Application

```bash
# In a second terminal
cd frontend
npm run dev
```

- Web Interface: `http://localhost:5173`
- The Vite dev server proxies API calls to `http://localhost:8000`.

---

## Running Tests

Execute the complete test suite across all four phases:

```bash
pytest -v backend/tests
```

All 38 tests run offline by default without requiring external API keys.

---

## API Endpoints

### 1. List Ingested Repositories
- **GET** `/repos`
- Returns a list of all local repositories, their commit hashes, commit messages, file counts, and ChromaDB indexing statuses.

### 2. Ingest Repository
- **POST** `/repos`
- Request:
  ```json
  {
    "repo_url": "https://github.com/psf/requests.git",
    "branch": "main"
  }
  ```
- Returns `repo_id`, commit hash, total valid file count, and filtered file listing.

### 3. Index Repository
- **POST** `/repos/{repo_id}/index`
- Parameters: `force` (boolean, optional, default `false`)
- Parses AST symbols, computes embeddings, and stores chunks in ChromaDB. Employs commit-hash caching to skip unchanged commits.

### 4. Semantic Search
- **GET** `/repos/{repo_id}/search?query=handle+timeout+retries&limit=5`
- Returns ranked code chunks with file paths, line ranges, symbol identities, and docstrings.

### 5. Read Source File Slice
- **GET** `/repos/{repo_id}/file?file_path=requests/sessions.py&start_line=1&end_line=50`
- Reads bounded source lines from disk with path traversal protections.

### 6. Ask Autonomous Agent (Blocking)
- **POST** `/repos/{repo_id}/ask`
- Request:
  ```json
  {
    "query": "Where is request timeout or retry handled?",
    "max_steps": 6,
    "model_provider": "gemini"
  }
  ```
- Returns synthesized answer, execution trajectory steps, and verified evidence citations.

### 7. Ask Autonomous Agent (Live SSE Stream)
- **POST** `/repos/{repo_id}/ask/stream`
- Streams real-time Server-Sent Events (`step_start`, `step_complete`, `synthesizing`, `complete`, `error`) for live investigation tracking in the web interface.

---

## Configuration

The system works out of the box with built-in mock and local providers. For production LLM reasoning and cloud embeddings, configure the following environment variables:

| Variable | Description | Default |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key for agent reasoning | None |
| `OPENAI_API_KEY` | OpenAI API key for agent reasoning / embeddings | None |
| `VOYAGE_API_KEY` | Voyage AI key for code embeddings | None |
| `REPOPILOT_LLM_PROVIDER` | Preferred LLM provider (`gemini`, `openai`, `mock`) | Auto-detected |
| `REPOPILOT_LLM_MODEL` | Specific model name (e.g., `gemini-3.7-flash`, `gpt-4o-mini`) | Provider default |
| `EMBEDDING_PROVIDER` | Preferred embedding model (`openai`, `voyage`, `local_onnx`, `mock`) | Auto-detected |

---

## Deployment on Render

This repository includes a `render.yaml` blueprint for one-click deployment on Render.

### Live Deployment

- Frontend Application: `https://repopilot-ui-uy96.onrender.com/` (or your configured `https://repopilot-frontend-*.onrender.com`)

### Method 1: Using Render Blueprint (Recommended)

1. Push your repository to GitHub.
2. Open the [Render Dashboard](https://dashboard.render.com).
3. Click **New +** and select **Blueprint**.
4. Connect your GitHub repository (`Repopilot-AI`).
5. Render detects `render.yaml` and provisions two services:
   - `repopilot-api`: Python web service running FastAPI and Uvicorn.
   - `repopilot-frontend`: Static site building the React frontend with Vite.
6. In the Render dashboard, navigate to `repopilot-api` -> **Environment** and add your API keys:
   - `GEMINI_API_KEY`: Your Google Gemini API key
   - `OPENAI_API_KEY` (optional): Your OpenAI API key
7. Click **Apply**. Both services will build and deploy automatically.

### Method 2: Manual Service Creation

If you prefer to configure services individually in Render:

#### 1. Backend Web Service:
- **Environment**: Python
- **Build Command**: `pip install -r requirements.txt && pip install -e backend`
- **Start Command**: `uvicorn repopilot.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables**:
  - `PYTHON_VERSION`: `3.11.9`
  - `GEMINI_API_KEY`: `<your-key>`
  - `REPOPILOT_LLM_PROVIDER`: `gemini`

#### 2. Frontend Static Site:
- **Service Name**: `repopilot-frontend`
- **Root Directory**: `frontend`
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist`
- **Rewrite Rules**: Source: `/*` -> Destination: `/index.html`
- **Environment Variables**:
  - `VITE_API_URL`: `https://<your-repopilot-api-url>.onrender.com`