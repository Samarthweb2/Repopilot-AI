"""Codebase inspection tools for the RepoPilot autonomous agent."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from repopilot.indexing.models import CodeChunk, SymbolTable
from repopilot.indexing.parser import CodeParser
from repopilot.indexing.vector_store import ChromaVectorStore
from repopilot.ingestion.clone import RepoIngestor

logger = logging.getLogger("repopilot.tools")

# Cache to avoid re-parsing the repo AST on every symbol lookup step
_SYMBOL_TABLE_CACHE: Dict[str, SymbolTable] = {}


def get_cached_symbol_table(
    repo_id: str,
    target_dir: Path,
    ingestor: Optional[RepoIngestor] = None,
    parser: Optional[CodeParser] = None,
) -> SymbolTable:
    """Retrieve or construct the AST SymbolTable for a given repository."""
    if repo_id in _SYMBOL_TABLE_CACHE:
        return _SYMBOL_TABLE_CACHE[repo_id]

    ingestor = ingestor or RepoIngestor()
    parser = parser or CodeParser()

    if not target_dir.exists():
        return SymbolTable()

    files = ingestor.walk_and_filter(target_dir)
    _, symbol_table = parser.parse_repo(target_dir, files)
    _SYMBOL_TABLE_CACHE[repo_id] = symbol_table
    return symbol_table


def clear_symbol_table_cache(repo_id: Optional[str] = None) -> None:
    """Clear symbol table cache for a given repo or all repos."""
    if repo_id:
        _SYMBOL_TABLE_CACHE.pop(repo_id, None)
    else:
        _SYMBOL_TABLE_CACHE.clear()


class CodebaseTools:
    """Provides safe, scoped repository inspection tools for an AI agent."""

    def __init__(
        self,
        repo_id: str,
        target_dir: Path,
        vector_store: Optional[ChromaVectorStore] = None,
        symbol_table: Optional[SymbolTable] = None,
    ) -> None:
        self.repo_id = repo_id
        self.target_dir = Path(target_dir).resolve()
        self.vector_store = vector_store or ChromaVectorStore()
        self._symbol_table = symbol_table

    @property
    def symbol_table(self) -> SymbolTable:
        """Lazily load symbol table if not provided."""
        if self._symbol_table is None:
            self._symbol_table = get_cached_symbol_table(self.repo_id, self.target_dir)
        return self._symbol_table

    def _resolve_safe_path(self, relative_path: str) -> Optional[Path]:
        """Resolves path and guarantees it stays within target_dir (prevents directory traversal)."""
        clean = relative_path.strip().lstrip("/\\")
        resolved = (self.target_dir / clean).resolve()
        try:
            resolved.relative_to(self.target_dir)
            return resolved
        except ValueError:
            return None

    def search_code(self, query: str, limit: int = 5) -> str:
        """Semantic search over indexed code chunks in the repository.

        Use this to find relevant functions, classes, and logic when you do not know the exact symbol name.
        """
        limit = max(1, min(limit, 10))
        try:
            matches = self.vector_store.search(query=query, repo_id=self.repo_id, limit=limit)
            if not matches:
                return f"No semantic matches found for query: '{query}' in repository {self.repo_id}."

            output = [f"Found {len(matches)} relevant code chunk(s) for '{query}':\n"]
            for idx, m in enumerate(matches, 1):
                parent = f" (parent: {m.parent_symbol})" if m.parent_symbol else ""
                output.append(
                    f"[{idx}] File: {m.file_path}:{m.start_line}-{m.end_line} | "
                    f"Symbol: {m.symbol_name} ({m.symbol_type}){parent} | Score: {m.score:.3f}"
                )
                if m.docstring:
                    doc = m.docstring.strip().replace("\n", " ")
                    if len(doc) > 160:
                        doc = doc[:160] + "..."
                    output.append(f"    Docstring: {doc}")

                code_lines = m.raw_code.strip().splitlines()
                preview = code_lines[:8]
                output.append("    Code snippet:")
                for offset, line in enumerate(preview):
                    output.append(f"      {m.start_line + offset}: {line}")
                if len(code_lines) > 8:
                    output.append(f"      ... [{len(code_lines) - 8} more lines]")
                output.append("")

            return "\n".join(output).strip()
        except Exception as e:
            logger.exception("Error executing search_code tool: %s", e)
            return f"Error executing semantic search: {str(e)}"

    def lookup_symbol(self, symbol_name: str, exact: bool = False) -> str:
        """Look up exact or partial symbol name (class, function, method) in the AST symbol index.

        Use this when you know the identifier or partial name of a class/function and need its declaration.
        """
        symbol_name = symbol_name.strip()
        if not symbol_name:
            return "Error: symbol_name cannot be empty."

        chunks = self.symbol_table.search(symbol_name, exact=exact)
        if not chunks:
            # If exact was requested and returned nothing, try non-exact search as fallback
            if exact:
                chunks = self.symbol_table.search(symbol_name, exact=False)

        if not chunks:
            return f"No AST symbol matches found for '{symbol_name}'."

        output = [f"Found {len(chunks)} declaration(s) matching '{symbol_name}':\n"]
        for idx, chunk in enumerate(chunks[:10], 1):
            parent = f" (parent: {chunk.parent_symbol})" if chunk.parent_symbol else ""
            output.append(
                f"[{idx}] File: {chunk.file_path}:{chunk.start_line}-{chunk.end_line} | "
                f"Symbol: {chunk.symbol_name} ({chunk.symbol_type}){parent}"
            )
            if chunk.docstring:
                doc = chunk.docstring.strip().replace("\n", " ")
                if len(doc) > 160:
                    doc = doc[:160] + "..."
                output.append(f"    Docstring: {doc}")

            code_lines = chunk.raw_code.strip().splitlines()
            preview = code_lines[:8]
            output.append("    Code snippet:")
            for offset, line in enumerate(preview):
                output.append(f"      {chunk.start_line + offset}: {line}")
            if len(code_lines) > 8:
                output.append(f"      ... [{len(code_lines) - 8} more lines]")
            output.append("")

        if len(chunks) > 10:
            output.append(f"... and {len(chunks) - 10} more declarations truncated.")

        return "\n".join(output).strip()

    def read_file_slice(self, file_path: str, start_line: int, end_line: int) -> str:
        """Read a precise slice of lines from a file in the repository.

        Line numbers are 1-indexed. Use this to inspect full implementations, verify logic, or examine context.
        """
        resolved = self._resolve_safe_path(file_path)
        if resolved is None:
            return f"Error: Access denied. Path '{file_path}' must be inside repository root."

        if not resolved.exists() or not resolved.is_file():
            return f"Error: File '{file_path}' does not exist in repository."

        if start_line < 1:
            start_line = 1
        if end_line < start_line:
            return f"Error: end_line ({end_line}) cannot be less than start_line ({start_line})."

        # Cap line slice to 200 lines to prevent context blowout
        max_slice = 200
        if (end_line - start_line + 1) > max_slice:
            end_line = start_line + max_slice - 1

        try:
            with open(resolved, "r", encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()

            total_lines = len(all_lines)
            if start_line > total_lines:
                return f"Error: start_line {start_line} exceeds file length ({total_lines} lines)."

            actual_end = min(end_line, total_lines)
            selected = all_lines[start_line - 1 : actual_end]

            rel_path = resolved.relative_to(self.target_dir).as_posix()
            output = [f"File: {rel_path} (lines {start_line}-{actual_end} of {total_lines}):"]
            for idx, line in enumerate(selected, start=start_line):
                output.append(f"{idx:4d} | {line.rstrip()}")

            return "\n".join(output)
        except Exception as e:
            logger.exception("Error reading file slice %s: %s", file_path, e)
            return f"Error reading file '{file_path}': {str(e)}"

    def list_directory(self, directory: str = "") -> str:
        """List contents of a directory in the repository to explore file structure."""
        resolved = self._resolve_safe_path(directory)
        if resolved is None:
            return f"Error: Access denied. Path '{directory}' must be inside repository root."

        if not resolved.exists() or not resolved.is_dir():
            return f"Error: Directory '{directory}' does not exist in repository."

        try:
            entries = []
            for item in sorted(resolved.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
                # Ignore git folder and hidden files
                if item.name.startswith("."):
                    continue
                if item.is_dir():
                    entries.append(f"  [DIR]  {item.name}/")
                else:
                    try:
                        size = item.stat().st_size
                        entries.append(f"  [FILE] {item.name} ({size:,} bytes)")
                    except OSError:
                        entries.append(f"  [FILE] {item.name}")

            rel_path = (
                resolved.relative_to(self.target_dir).as_posix() if resolved != self.target_dir else "."
            )
            if not entries:
                return f"Directory '{rel_path}' is empty."

            return f"Directory listing for '{rel_path}':\n" + "\n".join(entries)
        except Exception as e:
            logger.exception("Error listing directory %s: %s", directory, e)
            return f"Error listing directory '{directory}': {str(e)}"

    def execute(self, tool_name: str, arguments: Dict[str, Any]) -> str:
        """Dispatch and execute a tool call by name with validated arguments."""
        if tool_name == "search_code":
            query = str(arguments.get("query", ""))
            limit = int(arguments.get("limit", 5))
            return self.search_code(query=query, limit=limit)

        elif tool_name == "lookup_symbol":
            symbol_name = str(arguments.get("symbol_name", ""))
            exact = bool(arguments.get("exact", False))
            return self.lookup_symbol(symbol_name=symbol_name, exact=exact)

        elif tool_name == "read_file_slice":
            file_path = str(arguments.get("file_path", ""))
            start_line = int(arguments.get("start_line", 1))
            end_line = int(arguments.get("end_line", 50))
            return self.read_file_slice(file_path=file_path, start_line=start_line, end_line=end_line)

        elif tool_name == "list_directory":
            directory = str(arguments.get("directory", ""))
            return self.list_directory(directory=directory)

        else:
            return f"Error: Unknown tool '{tool_name}'."


# Standard tool definitions conforming to JSON Schema / OpenAI function declaration
TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_code",
            "description": "Perform semantic similarity search over repository code chunks. Use to discover logic, concepts, or algorithms when symbol names are unknown.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language or technical concept to search for (e.g. 'handle request retries' or 'validate jwt token').",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of code chunks to return (default 5, max 10).",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_symbol",
            "description": "Look up definitions of a function, class, or method by identifier name in the repository AST index.",
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol_name": {
                        "type": "string",
                        "description": "Exact or partial identifier name (e.g. 'HTTPAdapter' or 'send').",
                    },
                    "exact": {
                        "type": "boolean",
                        "description": "If True, perform exact case-sensitive match; if False, match substring (default False).",
                        "default": False,
                    },
                },
                "required": ["symbol_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file_slice",
            "description": "Read a specific line range from a file in the repository to inspect code details, imports, or context. Lines are 1-indexed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Relative file path from repository root (e.g. 'requests/adapters.py').",
                    },
                    "start_line": {
                        "type": "integer",
                        "description": "1-indexed starting line number.",
                    },
                    "end_line": {
                        "type": "integer",
                        "description": "1-indexed ending line number (inclusive).",
                    },
                },
                "required": ["file_path", "start_line", "end_line"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List files and subdirectories within a repository folder to inspect project structure.",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {
                        "type": "string",
                        "description": "Relative directory path from repository root (empty string for repo root).",
                        "default": "",
                    },
                },
                "required": [],
            },
        },
    },
]
