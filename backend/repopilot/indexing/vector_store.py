"""ChromaDB vector store integration for semantic code search in Repopilot AI."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional

import chromadb

from repopilot.indexing.embedder import BaseEmbedder, get_embedder, prepare_chunk_text
from repopilot.indexing.models import CodeChunk, IndexingResult, SearchResult

logger = logging.getLogger("repopilot.indexing.vector_store")

DEFAULT_PERSIST_DIR = "./repos/.chromadb"
CHUNKS_COLLECTION_NAME = "repopilot_code_chunks"
TRACKER_COLLECTION_NAME = "repopilot_repo_state"
BATCH_SIZE = 64


class ChromaVectorStore:
    """Manages persistence, batch indexing, and semantic search over code chunks using ChromaDB."""

    def __init__(
        self,
        persist_dir: str | Path = DEFAULT_PERSIST_DIR,
        embedder: Optional[BaseEmbedder] = None,
    ) -> None:
        self.persist_dir = Path(persist_dir).resolve()
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        self.embedder = embedder or get_embedder()
        embedder_suffix = self.embedder.__class__.__name__.lower()
        self.chunks_collection_name = f"{CHUNKS_COLLECTION_NAME}_{embedder_suffix}"
        self.tracker_collection_name = f"{TRACKER_COLLECTION_NAME}_{embedder_suffix}"

        # Initialize embedded persistent Chroma client
        self.client = chromadb.PersistentClient(path=str(self.persist_dir))

        # Collection for code chunks (cosine distance space)
        self.chunks_collection = self.client.get_or_create_collection(
            name=self.chunks_collection_name,
            metadata={"hnsw:space": "cosine"},
        )

        # Collection for tracking indexed repository commit hashes
        self.tracker_collection = self.client.get_or_create_collection(
            name=self.tracker_collection_name,
        )

    def is_indexed(self, repo_id: str, commit_hash: str) -> bool:
        """Check if repository at commit_hash is already indexed."""
        try:
            record = self.tracker_collection.get(ids=[repo_id])
            if record and record["metadatas"] and len(record["metadatas"]) > 0:
                meta = record["metadatas"][0]
                return meta.get("commit_hash") == commit_hash
        except Exception as e:
            logger.warning("Error checking index tracker for %s: %s", repo_id, e)
        return False

    def index_repository(
        self,
        repo_id: str,
        commit_hash: str,
        chunks: List[CodeChunk],
        force: bool = False,
    ) -> IndexingResult:
        """Batch-embed and upsert CodeChunks for a repository into the vector store.

        If commit_hash is unchanged since last indexing, skips processing unless force=True.
        """
        # 1. Commit cache check
        if not force and self.is_indexed(repo_id, commit_hash):
            logger.info("Repo %s already indexed at commit %s. Skipping re-index.", repo_id, commit_hash)
            return IndexingResult(
                repo_id=repo_id,
                commit_hash=commit_hash,
                status="skipped",
                chunks_count=0,
                symbols_count=0,
                skipped=True,
                message=f"Repository {repo_id} is already indexed at commit {commit_hash}.",
            )

        logger.info(
            "Indexing repo %s at commit %s (%d chunks)...",
            repo_id,
            commit_hash,
            len(chunks),
        )

        # 2. Purge previous vectors for this repo_id if updating to a new commit
        try:
            self.chunks_collection.delete(where={"repo_id": repo_id})
        except Exception as e:
            logger.debug("No existing chunks to delete for %s: %s", repo_id, e)

        if not chunks:
            self._update_repo_tracker(repo_id, commit_hash, 0)
            return IndexingResult(
                repo_id=repo_id,
                commit_hash=commit_hash,
                status="indexed",
                chunks_count=0,
                symbols_count=0,
                skipped=False,
                message="No code chunks to index in repository.",
            )

        # 3. Prepare formatted documents, IDs, and metadata
        docs: List[str] = []
        ids: List[str] = []
        metadatas: List[dict] = []
        raw_codes: List[str] = []
        distinct_symbols = set()

        for idx, chunk in enumerate(chunks):
            formatted_text, is_truncated = prepare_chunk_text(chunk)
            chunk_id = f"{repo_id}:{chunk.file_path}:{chunk.start_line}_{chunk.end_line}:{chunk.symbol_name}_{idx}"

            docs.append(formatted_text)
            ids.append(chunk_id)
            raw_codes.append(chunk.raw_code)
            distinct_symbols.add(chunk.symbol_name)

            metadatas.append(
                {
                    "repo_id": repo_id,
                    "commit_hash": commit_hash,
                    "file_path": chunk.file_path,
                    "start_line": int(chunk.start_line),
                    "end_line": int(chunk.end_line),
                    "symbol_name": chunk.symbol_name,
                    "symbol_type": chunk.symbol_type,
                    "parent_symbol": chunk.parent_symbol or "",
                    "docstring": chunk.docstring or "",
                    "truncated": bool(is_truncated),
                }
            )

        # 4. Batch compute embeddings and upsert into Chroma
        total = len(docs)
        for i in range(0, total, BATCH_SIZE):
            batch_docs = docs[i : i + BATCH_SIZE]
            batch_ids = ids[i : i + BATCH_SIZE]
            batch_metadatas = metadatas[i : i + BATCH_SIZE]
            batch_raw_codes = raw_codes[i : i + BATCH_SIZE]

            embeddings = self.embedder.embed_documents(batch_docs)

            self.chunks_collection.upsert(
                ids=batch_ids,
                embeddings=embeddings,
                documents=batch_raw_codes,  # Store raw code in Chroma documents for retrieval
                metadatas=batch_metadatas,
            )

        # 5. Update index tracker
        self._update_repo_tracker(repo_id, commit_hash, len(chunks))

        return IndexingResult(
            repo_id=repo_id,
            commit_hash=commit_hash,
            status="indexed",
            chunks_count=len(chunks),
            symbols_count=len(distinct_symbols),
            skipped=False,
            message=f"Successfully indexed {len(chunks)} chunks for repository {repo_id}.",
        )

    def _update_repo_tracker(self, repo_id: str, commit_hash: str, chunks_count: int) -> None:
        """Store repository indexing status and commit hash."""
        self.tracker_collection.upsert(
            ids=[repo_id],
            documents=[f"Repo {repo_id} at {commit_hash}"],
            metadatas=[
                {
                    "repo_id": repo_id,
                    "commit_hash": commit_hash,
                    "chunks_count": chunks_count,
                }
            ],
        )

    def search(self, query: str, repo_id: str, limit: int = 5) -> List[SearchResult]:
        """Perform semantic similarity search scoped to a specific repo_id."""
        query_text = query.strip()
        if not query_text:
            return []

        # Embed query vector
        query_vector = self.embedder.embed_query(query_text)

        # Query Chroma scoped with repo_id filter
        query_res = self.chunks_collection.query(
            query_embeddings=[query_vector],
            n_results=limit,
            where={"repo_id": repo_id},
        )

        results: List[SearchResult] = []

        ids_list = query_res.get("ids", [[]])[0]
        distances_list = query_res.get("distances", [[]])[0] if query_res.get("distances") else []
        documents_list = query_res.get("documents", [[]])[0] if query_res.get("documents") else []
        metadatas_list = query_res.get("metadatas", [[]])[0] if query_res.get("metadatas") else []

        for i, match_id in enumerate(ids_list):
            meta = metadatas_list[i] if i < len(metadatas_list) else {}
            raw_code = documents_list[i] if i < len(documents_list) else ""
            dist = distances_list[i] if i < len(distances_list) else 1.0

            # Convert cosine distance to similarity score in [0.0, 1.0]
            score = max(0.0, min(1.0, 1.0 - (dist / 2.0) if dist <= 2.0 else 0.0))

            results.append(
                SearchResult(
                    file_path=meta.get("file_path", ""),
                    start_line=meta.get("start_line", 1),
                    end_line=meta.get("end_line", 1),
                    symbol_name=meta.get("symbol_name", ""),
                    symbol_type=meta.get("symbol_type", "function"),
                    parent_symbol=meta.get("parent_symbol") or None,
                    docstring=meta.get("docstring") or None,
                    raw_code=raw_code,
                    score=round(score, 4),
                    repo_id=meta.get("repo_id", repo_id),
                )
            )

        return results
