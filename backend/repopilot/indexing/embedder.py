"""Embedding providers and text preparation for semantic code search in Repopilot AI."""

from __future__ import annotations

import hashlib
import logging
import math
import os
from abc import ABC, abstractmethod
from typing import List, Optional, Tuple

import httpx

from repopilot.indexing.models import CodeChunk

logger = logging.getLogger("repopilot.indexing.embedder")

DEFAULT_MAX_EMBED_CHARS = 8000  # ~2000-2500 tokens


def prepare_chunk_text(chunk: CodeChunk, max_chars: int = DEFAULT_MAX_EMBED_CHARS) -> Tuple[str, bool]:
    """Format and enrich CodeChunk with metadata and docstrings to optimize embedding retrieval quality.

    Returns:
        Tuple of (formatted_text, is_truncated)
    """
    header_lines = [
        f"# Symbol: {chunk.symbol_name} ({chunk.symbol_type})",
        f"# File: {chunk.file_path}:{chunk.start_line}-{chunk.end_line}",
    ]
    if chunk.parent_symbol:
        header_lines.append(f"# Parent: {chunk.parent_symbol}")
    if chunk.docstring:
        header_lines.append(f"# Description:\n{chunk.docstring}")

    content = "\n".join(header_lines) + "\n\n" + chunk.raw_code

    is_truncated = False
    if len(content) > max_chars:
        content = content[:max_chars] + "\n# [TRUNCATED DUE TO SIZE LIMIT]"
        is_truncated = True
        logger.warning(
            "Chunk %s in %s exceeded max_chars (%d), truncated.",
            chunk.symbol_name,
            chunk.file_path,
            max_chars,
        )

    return content, is_truncated


class BaseEmbedder(ABC):
    """Abstract base class for embedding providers."""

    @abstractmethod
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embed a batch of document texts into vector representations."""
        pass

    @abstractmethod
    def embed_query(self, text: str) -> List[float]:
        """Embed a single query text."""
        pass


class OpenAIEmbedder(BaseEmbedder):
    """Embedder using OpenAI's embeddings API (e.g. text-embedding-3-small)."""

    def __init__(
        self,
        model: str = "text-embedding-3-small",
        api_key: Optional[str] = None,
        base_url: str = "https://api.openai.com/v1",
        batch_size: int = 100,
    ) -> None:
        self.model = model
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError(
                "OpenAI API key not found. Set OPENAI_API_KEY environment variable "
                "or specify api_key explicitly."
            )
        self.base_url = base_url.rstrip("/")
        self.batch_size = batch_size

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        embeddings: List[List[float]] = []
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        with httpx.Client(timeout=60.0) as client:
            for i in range(0, len(texts), self.batch_size):
                batch = texts[i : i + self.batch_size]
                response = client.post(
                    f"{self.base_url}/embeddings",
                    headers=headers,
                    json={"input": batch, "model": self.model},
                )
                response.raise_for_status()
                data = response.json()
                sorted_data = sorted(data["data"], key=lambda x: x["index"])
                embeddings.extend([item["embedding"] for item in sorted_data])

        return embeddings

    def embed_query(self, text: str) -> List[float]:
        results = self.embed_documents([text])
        return results[0]


class VoyageEmbedder(BaseEmbedder):
    """Embedder using Voyage AI's code embedding models (e.g. voyage-code-3)."""

    def __init__(
        self,
        model: str = "voyage-code-3",
        api_key: Optional[str] = None,
        base_url: str = "https://api.voyageai.com/v1",
        batch_size: int = 64,
    ) -> None:
        self.model = model
        self.api_key = api_key or os.environ.get("VOYAGE_API_KEY")
        if not self.api_key:
            raise ValueError(
                "Voyage API key not found. Set VOYAGE_API_KEY environment variable "
                "or specify api_key explicitly."
            )
        self.base_url = base_url.rstrip("/")
        self.batch_size = batch_size

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        embeddings: List[List[float]] = []
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        with httpx.Client(timeout=60.0) as client:
            for i in range(0, len(texts), self.batch_size):
                batch = texts[i : i + self.batch_size]
                response = client.post(
                    f"{self.base_url}/embeddings",
                    headers=headers,
                    json={"input": batch, "model": self.model, "input_type": "document"},
                )
                response.raise_for_status()
                data = response.json()
                embeddings.extend([item["embedding"] for item in data["data"]])

        return embeddings

    def embed_query(self, text: str) -> List[float]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{self.base_url}/embeddings",
                headers=headers,
                json={"input": [text], "model": self.model, "input_type": "query"},
            )
            response.raise_for_status()
            data = response.json()
            return data["data"][0]["embedding"]


class MockEmbedder(BaseEmbedder):
    """Deterministic, offline feature-hashing embedder for unit tests and local development.

    Uses signed token feature hashing (dim=128) to provide accurate keyword and subword
    similarity matching completely offline without external network or API keys.
    """

    def __init__(self, dimension: int = 128) -> None:
        self.dimension = dimension

    def _hash_text(self, text: str) -> List[float]:
        vector = [0.0] * self.dimension
        import re

        tokens = re.findall(r"[a-zA-Z0-9]+", text.lower())
        if not tokens:
            return [1.0 / math.sqrt(self.dimension)] * self.dimension

        for token in tokens:
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            idx = h % self.dimension
            sign = 1.0 if ((h >> 16) & 1) else -1.0
            vector[idx] += sign

        norm = math.sqrt(sum(x * x for x in vector))
        if norm > 0:
            return [x / norm for x in vector]
        return [1.0 / math.sqrt(self.dimension)] * self.dimension

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._hash_text(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._hash_text(text)


class LocalONNXEmbedder(BaseEmbedder):
    """Real dense neural embedder using all-MiniLM-L6-v2 via ONNX (384 dimensions).

    Runs locally on CPU with zero external API keys or remote network calls.
    """

    def __init__(self, batch_size: int = 64) -> None:
        from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

        self.batch_size = batch_size
        self._fn = DefaultEmbeddingFunction()

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        embeddings: List[List[float]] = []
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i : i + self.batch_size]
            batch_embeddings = self._fn(batch)
            embeddings.extend([list(map(float, vec)) for vec in batch_embeddings])
        return embeddings

    def embed_query(self, text: str) -> List[float]:
        res = self._fn([text])
        return list(map(float, res[0]))


def get_embedder(provider: Optional[str] = None) -> BaseEmbedder:
    """Factory function resolving configured embedding provider.

    Options: 'openai', 'voyage', 'local' (all-MiniLM-L6-v2 ONNX), 'mock'.
    Defaults to 'openai' if OPENAI_API_KEY is set, 'voyage' if VOYAGE_API_KEY is set,
    otherwise 'local' for real on-device neural embeddings.
    """
    choice = provider or os.environ.get("EMBEDDING_PROVIDER")
    if not choice:
        if os.environ.get("OPENAI_API_KEY"):
            choice = "openai"
        elif os.environ.get("VOYAGE_API_KEY"):
            choice = "voyage"
        else:
            choice = "local"

    choice = choice.lower().strip()
    if choice == "openai":
        return OpenAIEmbedder()
    elif choice == "voyage":
        return VoyageEmbedder()
    elif choice in ("local", "onnx", "minilm"):
        return LocalONNXEmbedder()
    elif choice == "mock":
        return MockEmbedder()
    else:
        raise ValueError(
            f"Unknown embedding provider: '{choice}'. Choose 'openai', 'voyage', 'local', or 'mock'."
        )
