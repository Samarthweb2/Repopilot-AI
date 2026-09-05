"""Indexing package for Repopilot AI."""

from repopilot.indexing.embedder import (
    BaseEmbedder,
    LocalONNXEmbedder,
    MockEmbedder,
    OpenAIEmbedder,
    VoyageEmbedder,
    get_embedder,
    prepare_chunk_text,
)
from repopilot.indexing.models import (
    CodeChunk,
    IndexingResult,
    SearchResult,
    SymbolTable,
)
from repopilot.indexing.parser import CodeParser
from repopilot.indexing.vector_store import ChromaVectorStore

__all__ = [
    "BaseEmbedder",
    "ChromaVectorStore",
    "CodeChunk",
    "CodeParser",
    "IndexingResult",
    "LocalONNXEmbedder",
    "MockEmbedder",
    "OpenAIEmbedder",
    "SearchResult",
    "SymbolTable",
    "VoyageEmbedder",
    "get_embedder",
    "prepare_chunk_text",
]
