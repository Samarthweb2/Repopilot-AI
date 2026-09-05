"""Repopilot AI FastAPI Application Entrypoint."""

import sys
from pathlib import Path

# Ensure backend directory is on sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from repopilot.main import app

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("repopilot.main:app", host="0.0.0.0", port=8000, reload=True)
