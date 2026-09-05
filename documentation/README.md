# Repopilot AI Documentation

Welcome to the comprehensive technical documentation for **Repopilot AI**.

## Core Topics
- [System Architecture](architecture.md): The end-to-end 5-stage pipeline from GitHub repo to AI answer with code evidence.
- [Ingestion Pipeline](ingestion_pipeline.md): Git clone & update caching, deterministic hashing, and intelligent tree filtering.
- [REST API Reference](api_reference.md): Endpoint specifications, request/response models, and error responses.

## Quick Start
To get started running the backend:
```powershell
# In workspace root:
.venv\Scripts\activate
uvicorn backend.main:app --reload --port 8000
```
Interactive Swagger documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).
