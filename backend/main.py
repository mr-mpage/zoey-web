import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import init_db
from .routers import auth, dashboard, diapers, feeds, overview, pumps, push, settings, weight
from .scheduler import reminder_loop

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(reminder_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Zoey Tracker", docs_url=None, redoc_url=None, lifespan=lifespan)

init_db()

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(feeds.router)
app.include_router(pumps.router)
app.include_router(weight.router)
app.include_router(settings.router)
app.include_router(diapers.router)
app.include_router(push.router)
app.include_router(overview.router)


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
        # SPA fallback: never cache HTML so a not-yet-deployed asset path can't
        # get pinned as the index.html bytes by an upstream cache (Cloudflare).
        return FileResponse(
            static_dir / "index.html",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )
