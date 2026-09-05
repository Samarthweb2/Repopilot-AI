"""FastAPI API routes for Repopilot AI."""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
import git

from repopilot.agent import AgentLoop, QueryRequest, QueryResponse, get_llm_client
from repopilot.indexing.models import IndexingResult, SearchResult
from repopilot.indexing.parser import CodeParser
from repopilot.indexing.vector_store import ChromaVectorStore
from repopilot.ingestion.clone import (
    EmptyRepoError,
    InvalidRepoURLError,
    RepoAccessError,
    RepoIngestor,
)
from repopilot.models.schemas import ErrorDetail, RepoCreateRequest, RepoStatus
from repopilot.tools import CodebaseTools

logger = logging.getLogger("repopilot.api")

router = APIRouter(tags=["repos"])

_default_ingestor: Optional[RepoIngestor] = None
_default_vector_store: Optional[ChromaVectorStore] = None
_default_code_parser: Optional[CodeParser] = None


def get_repo_ingestor() -> RepoIngestor:
    """Dependency provider for RepoIngestor."""
    global _default_ingestor
    if _default_ingestor is None:
        _default_ingestor = RepoIngestor()
    return _default_ingestor


def get_vector_store() -> ChromaVectorStore:
    """Dependency provider for ChromaVectorStore."""
    global _default_vector_store
    if _default_vector_store is None:
        _default_vector_store = ChromaVectorStore()
    return _default_vector_store


def get_code_parser() -> CodeParser:
    """Dependency provider for CodeParser."""
    global _default_code_parser
    if _default_code_parser is None:
        _default_code_parser = CodeParser()
    return _default_code_parser


@router.post(
    "/repos",
    response_model=RepoStatus,
    status_code=status.HTTP_200_OK,
    summary="Clone or update a Git repository and index its file tree",
    description=(
        "Clones or updates a repository from `repo_url`, checks out the requested branch, "
        "filters out binaries, lockfiles, hidden items, and large files (>2MB), "
        "and returns metadata including commit hash, file count, and file listing."
    ),
    responses={
        200: {"description": "Repository cloned or updated successfully", "model": RepoStatus},
        400: {"description": "Invalid repository URL or empty repository", "model": ErrorDetail},
        404: {"description": "Repository not accessible or branch not found", "model": ErrorDetail},
        500: {"description": "Internal server error during ingestion", "model": ErrorDetail},
    },
)
async def create_or_update_repo(
    request: RepoCreateRequest,
    ingestor: RepoIngestor = Depends(get_repo_ingestor),
) -> RepoStatus:
    """Clones or updates a Git repository, walks the filtered file tree, and returns repository metadata."""
    try:
        status_result = ingestor.ingest(repo_url=request.repo_url, branch=request.branch)
        return status_result
    except InvalidRepoURLError as e:
        logger.warning("Invalid repo URL requested: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except EmptyRepoError as e:
        logger.warning("Empty repo requested: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except RepoAccessError as e:
        logger.warning("Repo access error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        ) from e
    except Exception as e:
        logger.exception("Unexpected error during repo ingestion: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ingest repository: {str(e)}",
        ) from e


@router.post(
    "/repos/{repo_id}/index",
    response_model=IndexingResult,
    status_code=status.HTTP_200_OK,
    summary="Parse AST symbols and embed repository chunks into vector store",
    description=(
        "Explicit indexing action: extracts CodeChunks at class/function/method granularity "
        "and batch-embeds them into ChromaDB. Skips embedding if the repository's commit_hash "
        "has not changed since the last index, unless force=True."
    ),
    responses={
        200: {"description": "Indexing completed or skipped via cache", "model": IndexingResult},
        404: {"description": "Repository not found locally", "model": ErrorDetail},
        500: {"description": "Error during AST parsing or vector embedding", "model": ErrorDetail},
    },
)
async def index_repo(
    repo_id: str,
    force: bool = Query(default=False, description="Force re-indexing even if commit_hash is unchanged."),
    ingestor: RepoIngestor = Depends(get_repo_ingestor),
    parser: CodeParser = Depends(get_code_parser),
    vector_store: ChromaVectorStore = Depends(get_vector_store),
) -> IndexingResult:
    """Extracts AST code chunks and embeds them into the vector store with commit caching."""
    target_dir = ingestor._get_target_dir(repo_id)
    if not target_dir.exists() or not (target_dir / ".git").exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{repo_id}' not found locally. Call POST /repos first to clone it.",
        )

    try:
        git_repo = git.Repo(target_dir)
        commit_hash = git_repo.head.commit.hexsha
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read repository commit: {str(e)}",
        ) from e

    # Check commit cache
    if not force and vector_store.is_indexed(repo_id, commit_hash):
        return IndexingResult(
            repo_id=repo_id,
            commit_hash=commit_hash,
            status="skipped",
            chunks_count=0,
            symbols_count=0,
            skipped=True,
            message=f"Repository {repo_id} is already indexed at commit {commit_hash}.",
        )

    try:
        # Phase 1 files -> Phase 2 AST chunks
        files = ingestor.walk_and_filter(target_dir)
        chunks, symbol_table = parser.parse_repo(target_dir, files)

        # Phase 2 AST chunks -> Phase 3 Vector embeddings
        indexing_result = vector_store.index_repository(
            repo_id=repo_id,
            commit_hash=commit_hash,
            chunks=chunks,
            force=force,
        )
        return indexing_result
    except Exception as e:
        logger.exception("Failed to index repository %s: %s", repo_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to index repository: {str(e)}",
        ) from e


@router.get(
    "/repos/{repo_id}/search",
    response_model=List[SearchResult],
    status_code=status.HTTP_200_OK,
    summary="Semantic code search across an indexed repository",
    description=(
        "Performs natural-language semantic similarity search over code chunks, "
        "strictly scoped to the specified repository ID."
    ),
    responses={
        200: {"description": "Ranked list of relevant code chunks", "model": List[SearchResult]},
        404: {"description": "Repository not found locally", "model": ErrorDetail},
        500: {"description": "Error during search execution", "model": ErrorDetail},
    },
)
async def search_repo(
    repo_id: str,
    query: str = Query(..., description="Natural language or technical search query.", min_length=1),
    limit: int = Query(default=5, ge=1, le=50, description="Maximum number of chunks to return."),
    ingestor: RepoIngestor = Depends(get_repo_ingestor),
    vector_store: ChromaVectorStore = Depends(get_vector_store),
) -> List[SearchResult]:
    """Semantic code search across indexed code chunks scoped by repo_id."""
    target_dir = ingestor._get_target_dir(repo_id)
    if not target_dir.exists() or not (target_dir / ".git").exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{repo_id}' not found locally. Call POST /repos first.",
        )

    try:
        matches = vector_store.search(query=query, repo_id=repo_id, limit=limit)
        return matches
    except Exception as e:
        logger.exception("Error executing search on repo %s: %s", repo_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}",
        ) from e


@router.post(
    "/repos/{repo_id}/ask",
    response_model=QueryResponse,
    status_code=status.HTTP_200_OK,
    summary="Ask a question about the repository answered by the autonomous agent",
    description=(
        "Executes a multi-step ReAct investigation loop. The agent semantically searches code, "
        "looks up AST symbols, reads precise source lines from disk, and synthesizes an authoritative "
        "answer backed by verifiable code evidence citations."
    ),
    responses={
        200: {"description": "Synthesized answer with evidence and reasoning trajectory", "model": QueryResponse},
        404: {"description": "Repository not found locally", "model": ErrorDetail},
        500: {"description": "Agent execution error", "model": ErrorDetail},
    },
)
async def ask_repo(
    repo_id: str,
    request: QueryRequest,
    ingestor: RepoIngestor = Depends(get_repo_ingestor),
    vector_store: ChromaVectorStore = Depends(get_vector_store),
) -> QueryResponse:
    """Executes multi-step agent investigation loop to answer queries with code evidence."""
    target_dir = ingestor._get_target_dir(repo_id)
    if not target_dir.exists() or not (target_dir / ".git").exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{repo_id}' not found locally. Call POST /repos first.",
        )

    try:
        tools = CodebaseTools(
            repo_id=repo_id,
            target_dir=target_dir,
            vector_store=vector_store,
        )
        llm_client = get_llm_client(
            provider=request.model_provider,
            model_name=request.model_name,
        )
        agent = AgentLoop(
            repo_id=repo_id,
            target_dir=target_dir,
            tools=tools,
            llm_client=llm_client,
        )
        response = await agent.run(query=request.query, max_steps=request.max_steps)
        return response
    except Exception as e:
        logger.exception("Error executing agent loop on repo %s: %s", repo_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent investigation failed: {str(e)}",
        ) from e

