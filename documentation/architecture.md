# Repopilot AI - System Architecture

Repopilot AI operates on a modular 5-stage pipeline designed for deep understanding, indexing, and reasoning over arbitrary codebases.

```
┌─────────────────┐
│   GitHub Repo   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 1. Ingestion    │  Git clone / fetch+hard-reset, tree walk & filtering
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Code Index   │  AST symbol parsing (Tree-sitter) + Dense Vector Embeddings
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Tools        │  Symbol lookup, fuzzy regex search, file slice reader
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Agent Loop   │  LLM function calling, multi-step exploration & validation
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Evidence     │  Synthesized answer + precise file path & line citations
└─────────────────┘
```

---

## The 5 Pipeline Stages

### 1. Ingestion (`backend/repopilot/ingestion/`)
- Accepts any public or authenticated Git URL and optional branch.
- Computes deterministic 12-char SHA-256 identifier (`repo_id`).
- Clones into `./repos/{repo_id}` or performs fetch + checkout + hard-reset if already present.
- Walks the directory tree, aggressively filtering out build artifacts, dependencies (`node_modules`, `venv`), binary files, lockfiles, empty files, and files >2MB.
- Outputs `RepoStatus` containing `files: List[FileInfo]`.

### 2. Code Indexing (`backend/repopilot/indexing/`) [Phase 2]
- **Integration Seam**: Directly ingests Phase 1 output:
  `CodeParser.parse_repo(repo_path: str | Path, files: List[FileInfo]) -> Tuple[List[CodeChunk], SymbolTable]`
- **AST Parser**: Tree-sitter parsers for Python, JavaScript, TypeScript, TSX.
- Extracts symbols at semantic granularity: functions, classes, methods, docstrings, parent hierarchies.
- **SymbolTable**: In-memory multi-map index (`symbol_name -> List[CodeChunk]`).
- **Embeddings**: Chunking by logical AST block boundaries (not arbitrary character splits) converted into vector embeddings.

### 3. Agent Tools (`backend/tools/`) [Phase 3]
Exposes atomic tools for the agent to inspect the codebase:
- `search_code(query, language)`: Semantic vector search + lexical BM25 search.
- `lookup_symbol(name, type)`: Find definitions and references using the AST index.
- `read_file(path, start_line, end_line)`: Read exact source code lines.
- `list_directory(path)`: Explore project file structure.

### 4. Agent Loop (`backend/agent/`) [Phase 4]
- Driven by a tool-calling LLM model.
- Evaluates the user query, formulates a search plan, calls inspection tools, evaluates results, and iterates until sufficient evidence is gathered.

### 5. Answer & Evidence [Phase 5]
- Assembles a definitive answer with clickable file links and line-number references.
- Backed by an interactive frontend dashboard for visual verification.
