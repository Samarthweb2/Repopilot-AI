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
   - Orchestrates a ReAct (Reasoning and Acting) investigation loop with tool-calling.
   - Equips the agent with four tools: `search_code`, `lookup_symbol`, `read_file_slice`, and `list_directory`.
   - Protects against directory traversal and limits file slice sizes.
   - Enforces a hard step limit to prevent infinite loops.
   - Extracts structured evidence citations directly from verified source files on disk.

---

## Directory Structure

```
Repopilot-AI/
├── backend/
│   ├── pyproject.toml         # Backend package specifications and dependencies
│   ├── repopilot/
│   │   ├── main.py            # FastAPI application entrypoint
│   │   ├── api/
│   │   │   └── routes.py      # REST API route handlers
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
│   │   │   ├── loop.py        # Autonomous ReAct agent loop
│   │   │   ├── llm.py         # Multi-provider LLM clients (Gemini, OpenAI, Mock)
│   │   │   ├── models.py      # AgentStep, EvidenceCitation, Query schemas
│   │   │   └── __init__.py    # Agent exports
│   │   └── models/
│   │       └── schemas.py     # API request and response schemas
│   └── tests/
│       ├── test_api.py        # API health and endpoint tests
│       ├── test_ingestion.py  # Git cloning and filtering tests
│       ├── test_parser.py     # AST parsing and symbol table tests
│       ├── test_vector_store.py # ChromaDB and embedding tests
│       └── test_agent.py      # Tool, loop, and ask endpoint tests
├── documentation/             # Detailed architecture and API references
├── frontend/                  # Frontend user interface directory
└── requirements.txt           # Unified dependency listing
```

---

## Installation and Setup

### Prerequisites

- Python 3.10 or higher (Python 3.12 recommended)
- Git installed and available on PATH

### 1. Set Up Virtual Environment

```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On Linux / macOS:
source .venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
pip install -e backend
```

---

## Running the Server

Start the FastAPI application with Uvicorn:

```bash
uvicorn repopilot.main:app --reload --port 8000
```

Once running:
- API Base URL: `http://localhost:8000`
- Swagger Documentation: `http://localhost:8000/docs`
- ReDoc Documentation: `http://localhost:8000/redoc`

---

## Running Tests

Execute the complete test suite across all four phases:

```bash
pytest -v backend/tests
```

All 32 tests run offline by default without requiring external API keys.

---

## API Endpoints

### 1. Ingest Repository
- **POST** `/repos`
- Request:
  ```json
  {
    "repo_url": "https://github.com/psf/requests.git",
    "branch": "main"
  }
  ```
- Response: Returns `repo_id`, commit hash, total valid file count, and filtered file listing.

### 2. Index Repository
- **POST** `/repos/{repo_id}/index`
- Parameters: `force` (boolean, optional, default `false`)
- Response: Parses AST symbols, computes embeddings, and stores chunks in ChromaDB. Returns `chunks_count`, `symbols_count`, and whether indexing was skipped via commit cache.

### 3. Semantic Search
- **GET** `/repos/{repo_id}/search?query=handle+timeout+retries&limit=5`
- Response: Ranked list of matching code chunks with file paths, line ranges, symbol identities, docstrings, similarity scores, and code previews.

### 4. Ask Autonomous Agent
- **POST** `/repos/{repo_id}/ask`
- Request:
  ```json
  {
    "query": "Where is request timeout or retry handled?",
    "max_steps": 6,
    "model_provider": "gemini"
  }
  ```
- Response: Returns synthesized answer, execution trajectory steps, and verified evidence citations extracted from actual source lines on disk.

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