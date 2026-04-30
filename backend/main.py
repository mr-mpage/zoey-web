import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles

from .db import init_db
from .owlet import owlet_poll_loop, vitals_compaction_loop
from .routers import auth, dashboard, diapers, feeds, overview, pumps, push, report, settings, vitals, weight
from .scheduler import reminder_loop

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(reminder_loop()),
        asyncio.create_task(owlet_poll_loop()),
        asyncio.create_task(vitals_compaction_loop()),
    ]
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        for t in tasks:
            try:
                await t
            except asyncio.CancelledError:
                pass
            except Exception:  # noqa: BLE001
                logging.getLogger(__name__).exception("background task failed during shutdown")


app = FastAPI(title="Zoey Tracker", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

init_db()


# Content Security Policy: same-origin only. Inline styles are allowed because
# Tailwind v4's runtime injects them; inline scripts are not. PWA service
# worker is at /sw.js, push subscriptions go to push.api.* via the platform
# push service so connect-src has to allow https. data: in img-src is needed
# for any inline-encoded assets the bundler emits.
_CSP = (
    "default-src 'self'; "
    "img-src 'self' data:; "
    "style-src 'self' 'unsafe-inline'; "
    "script-src 'self'; "
    "connect-src 'self' https:; "
    "font-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'; "
    "manifest-src 'self'; "
    "worker-src 'self'"
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    # Owned-content posture: same-origin only, no embedding, no sniffing,
    # no referrer leakage, no indexing, no opt-in browser features.
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), interest-cohort=(), "
        "browsing-topics=(), payment=()"
    )
    response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive, nosnippet"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    response.headers.setdefault("Content-Security-Policy", _CSP)
    return response


@app.get("/robots.txt", response_class=PlainTextResponse, include_in_schema=False)
def robots() -> str:
    return "User-agent: *\nDisallow: /\n"

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(feeds.router)
app.include_router(pumps.router)
app.include_router(weight.router)
app.include_router(settings.router)
app.include_router(diapers.router)
app.include_router(push.router)
app.include_router(overview.router)
app.include_router(report.router)
app.include_router(vitals.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


static_dir = (Path(__file__).resolve().parent.parent / "static").resolve()
if static_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str) -> FileResponse:
        # Resolve and confine: any candidate path that escapes static_dir
        # via .., absolute paths, or symlinks falls through to the SPA
        # index. Prevents path-traversal serving of files outside /static.
        if full_path:
            try:
                candidate = (static_dir / full_path).resolve()
                if candidate.is_file() and candidate.is_relative_to(static_dir):
                    return FileResponse(candidate)
            except (OSError, ValueError):
                pass
        # SPA fallback: never cache HTML so a not-yet-deployed asset path
        # can't get pinned as the index.html bytes by an upstream cache.
        return FileResponse(
            static_dir / "index.html",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )
