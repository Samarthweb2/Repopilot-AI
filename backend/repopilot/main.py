"""Repopilot AI FastAPI Application Entrypoint."""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from repopilot.api.routes import router as repos_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="Repopilot AI",
    description=(
        "Autonomous code intelligence engine: "
        "GitHub Repo → Ingestion → Code Index (AST + embeddings) → Agent Loop (tool-calling) → Answer + Evidence."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(repos_router)


@app.get("/", tags=["system"])
async def root():
    """Service status and meta information."""
    return {
        "service": "Repopilot AI",
        "status": "online",
        "version": "0.1.0",
        "docs": "/docs",
    }


@app.get("/health", tags=["system"])
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("repopilot.main:app", host="0.0.0.0", port=8000, reload=True)
