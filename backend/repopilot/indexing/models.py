"""Data models for AST indexing and symbol resolution in Repopilot AI."""

from __future__ import annotations

from typing import Dict, Iterator, List, Optional
from pydantic import BaseModel, Field


class CodeChunk(BaseModel):
    """Represents a discrete semantic code unit (function, class, method, or fallback file chunk)."""

    file_path: str = Field(
        ...,
        description="Relative file path from repository root (e.g. 'src/auth/service.py').",
    )
    start_line: int = Field(
        ...,
        description="1-indexed starting line number in the source file.",
    )
    end_line: int = Field(
        ...,
        description="1-indexed ending line number in the source file (inclusive).",
    )
    symbol_name: str = Field(
        ...,
        description="Name of the function, class, method, or file section.",
    )
    symbol_type: str = Field(
        ...,
        description="Type of symbol: 'function', 'class', 'method', or 'file'.",
    )
    parent_symbol: Optional[str] = Field(
        default=None,
        description="Enclosing symbol name if nested (e.g. enclosing ClassName for a method), or None.",
    )
    docstring: Optional[str] = Field(
        default=None,
        description="Extracted docstring or JSDoc comment if present.",
    )
    raw_code: str = Field(
        ...,
        description="Exact source code text of this chunk.",
    )
    parse_error: Optional[str] = Field(
        default=None,
        description="Populated with error description if AST parsing degraded to fallback chunk.",
    )


class SymbolTable:
    """Multi-map symbol table mapping symbol names to their CodeChunk declarations.

    Supports multiple definitions across different files or overloads.
    """

    def __init__(self) -> None:
        self._table: Dict[str, List[CodeChunk]] = {}

    def add(self, chunk: CodeChunk) -> None:
        """Register a CodeChunk in the symbol table."""
        symbol = chunk.symbol_name
        if symbol not in self._table:
            self._table[symbol] = []
        self._table[symbol].append(chunk)

    def lookup(self, symbol_name: str) -> List[CodeChunk]:
        """Perform exact case-sensitive lookup for symbol_name."""
        return self._table.get(symbol_name, [])

    def search(self, query: str, exact: bool = False) -> List[CodeChunk]:
        """Search for symbols matching query.

        If exact is True, performs case-sensitive exact match.
        If exact is False, performs case-insensitive substring search.
        """
        if exact:
            return self.lookup(query)

        query_lower = query.lower()
        results: List[CodeChunk] = []
        for name, chunks in self._table.items():
            if query_lower in name.lower():
                results.extend(chunks)
        return results

    def get_symbols(self) -> List[str]:
        """Return list of all registered symbol names."""
        return sorted(self._table.keys())

    def get_all_chunks(self) -> List[CodeChunk]:
        """Return all registered CodeChunks across all symbols."""
        seen = set()
        unique_chunks: List[CodeChunk] = []
        for chunks in self._table.values():
            for chunk in chunks:
                key = (chunk.file_path, chunk.start_line, chunk.end_line, chunk.symbol_name)
                if key not in seen:
                    seen.add(key)
                    unique_chunks.append(chunk)
        return unique_chunks

    def to_dict(self) -> Dict[str, List[dict]]:
        """Serialize symbol table to dictionary representation."""
        return {
            symbol: [chunk.model_dump() for chunk in chunks]
            for symbol, chunks in self._table.items()
        }

    def __len__(self) -> int:
        return sum(len(chunks) for chunks in self._table.values())

    def __iter__(self) -> Iterator[str]:
        return iter(self._table)

    def __repr__(self) -> str:
        return f"<SymbolTable distinct_symbols={len(self._table)} total_chunks={len(self)}>"


class SearchResult(BaseModel):
    """Semantic search match returned by the vector store."""

    file_path: str = Field(..., description="Relative file path of the matched chunk.")
    start_line: int = Field(..., description="1-indexed starting line number.")
    end_line: int = Field(..., description="1-indexed ending line number.")
    symbol_name: str = Field(..., description="Identifier name of the code symbol.")
    symbol_type: str = Field(..., description="Type of symbol (function, class, method, file).")
    parent_symbol: Optional[str] = Field(default=None, description="Parent symbol name if nested.")
    docstring: Optional[str] = Field(default=None, description="Docstring if available.")
    raw_code: str = Field(..., description="Raw source code of the matched chunk.")
    score: float = Field(..., description="Similarity relevance score (higher is more relevant, 0.0-1.0).")
    repo_id: str = Field(..., description="Repository ID this chunk belongs to.")


class IndexingResult(BaseModel):
    """Result returned when a repository is indexed into the vector store."""

    repo_id: str = Field(..., description="Repository ID.")
    commit_hash: str = Field(..., description="Commit SHA hash indexed.")
    status: str = Field(..., description="'indexed' if newly indexed, 'skipped' if already indexed.")
    chunks_count: int = Field(..., description="Number of CodeChunks indexed.")
    symbols_count: int = Field(..., description="Number of distinct symbols registered.")
    skipped: bool = Field(default=False, description="True if indexing was skipped due to commit cache.")
    message: Optional[str] = Field(default=None, description="Status detail message.")

