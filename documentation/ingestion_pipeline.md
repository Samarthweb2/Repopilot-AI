# Ingestion Pipeline Deep Dive

The ingestion pipeline implemented in `backend/ingestion/clone.py` ensures fast, reliable, and secure access to codebases while protecting the indexing engine from noise and unneeded files.

---

## 1. Storage & Deterministic Hashing

Each repository URL is hashed using SHA-256:
```python
repo_id = hashlib.sha256(repo_url.strip().rstrip("/").encode("utf-8")).hexdigest()[:12]
```
The local repository is cached under:
```
./repos/{repo_id}/
```

## 2. Synchronization Strategy (Clone vs Update)

- **Fresh Clone**: If `./repos/{repo_id}/.git` does not exist:
  ```python
  git.Repo.clone_from(repo_url, target_dir, branch=branch, env={"GIT_TERMINAL_PROMPT": "0"})
  ```
- **Incremental Sync**: If `./repos/{repo_id}` already exists:
  1. `origin.fetch(prune=True)` retrieves latest changes from the remote.
  2. If a branch is specified, checks out or creates the local tracking branch.
  3. `git reset --hard origin/<branch>` updates the working tree to the latest remote commit.
  4. `git clean -fdx` wipes any leftover or untracked build artifacts.

`GIT_TERMINAL_PROMPT=0` is explicitly set in GitPython calls to avoid hanging the server when requesting private or non-existent repositories.

---

## 3. Tree Walk & Filtering Engine

When building the file index, `RepoIngestor.walk_and_filter()` applies multi-tiered exclusion rules:

### A. Excluded Directories (Pruned Early)
Directly pruned during `os.walk` traversal to avoid traversing huge dependency folders:
- `.git`
- `node_modules`
- `venv`, `.venv`, `env`, `.env`
- `dist`, `build`, `target`, `bin`, `obj`, `vendor`
- `__pycache__`, `.idea`, `.vscode`, `.next`, `.nuxt`, `.pytest_cache`, `.mypy_cache`

### B. Excluded Binary & Media Extensions
- Executables & Libraries: `.exe`, `.dll`, `.so`, `.dylib`, `.bin`, `.pyc`, `.jar`, `.class`
- Compressed Archives: `.tar`, `.gz`, `.zip`, `.7z`, `.rar`
- Images & Media: `.png`, `.jpg`, `.jpeg`, `.gif`, `.ico`, `.svg`, `.mp4`, `.mov`, etc.
- Fonts & DBs: `.woff`, `.woff2`, `.ttf`, `.db`, `.sqlite`, `.sqlite3`

### C. Excluded Lockfiles
- `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `Cargo.lock`, `composer.lock`, `flake.lock`

### D. Size Constraints
- **0 Bytes**: Empty files are discarded.
- **> 2MB**: Extremely large files (dumps, bundled files) are discarded to protect downstream AST parsers and embedding token limits.
