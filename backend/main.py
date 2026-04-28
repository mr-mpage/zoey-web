import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import init_db
from .routers import auth, dashboard, feeds, pumps, weight

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Zoey Tracker", docs_url=None, redoc_url=None)

init_db()

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(feeds.router)
app.include_router(pumps.router)
app.include_router(weight.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str) -> FileResponse:
        candidate = static_dir / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(static_dir / "index.html")
