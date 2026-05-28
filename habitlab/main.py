# habitlab/main.py
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from habitlab.configs import settings
from habitlab.db import DB_PATH, init_db
from habitlab.logger import logger
from habitlab.migrate import migrate_if_needed
from habitlab.routes.auth import router as auth_router
from habitlab.routes.api import init_api_routes
from habitlab.routes.metrics import init_metrics_routes
from habitlab.routes.pages import init_page_routes

logger.info("Starting HabitLab...")

PROJECT_ROOT = Path(__file__).resolve().parent
STATIC_DIR = PROJECT_ROOT / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.DEBUG:
        logger.info("Debug mode enabled")
    await migrate_if_needed(DB_PATH)
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

UPLOADS_DIR = Path(settings.DATA_DIR) / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

init_metrics_routes(app)
app.include_router(auth_router)
init_api_routes(app)
init_page_routes(app)


@app.middleware("http")
async def request_timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Process-Time"] = f"{elapsed_ms:.0f}"
    logger.info(
        "%s %s %d %.0fms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.middleware("http")
async def js_no_cache(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/static/js/") and path.endswith(".js"):
        response.headers["Cache-Control"] = "no-cache"
    return response
