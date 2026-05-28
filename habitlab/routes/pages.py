import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from habitlab import db as habitdb

PROJECT_ROOT = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=PROJECT_ROOT / "templates")

# Cache-bust static assets across deploys: changes on every server start.
ASSET_VERSION = str(int(time.time()))
templates.env.globals["asset_version"] = ASSET_VERSION

NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
}


async def _setup_required() -> bool:
    return await habitdb.get_password_hash() is None


def init_page_routes(app: FastAPI) -> None:
    @app.get("/login", response_class=HTMLResponse)
    async def login_page(request: Request):
        setup_required = await _setup_required()
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "setup_required": setup_required},
            headers=NO_CACHE_HEADERS,
        )

    @app.get("/", response_class=HTMLResponse)
    async def index_page(request: Request):
        return RedirectResponse(url="/today")

    @app.get("/habits", response_class=HTMLResponse)
    async def habits_page(request: Request):
        return templates.TemplateResponse(
            "index.html", {"request": request}, headers=NO_CACHE_HEADERS
        )

    @app.get("/habits/{habit_id}", response_class=HTMLResponse)
    async def habit_detail_page(habit_id: str, request: Request):
        return templates.TemplateResponse(
            "habit_detail.html",
            {"request": request, "habit_id": habit_id},
            headers=NO_CACHE_HEADERS,
        )

    @app.get("/heatmap/{habit_id}", response_class=HTMLResponse)
    async def heatmap_page(habit_id: str, request: Request):
        return templates.TemplateResponse(
            "heatmap.html",
            {"request": request, "habit_id": habit_id},
            headers=NO_CACHE_HEADERS,
        )

    @app.get("/stats")
    async def stats_redirect():
        return RedirectResponse(url="/", status_code=302)

    @app.get("/notes", response_class=HTMLResponse)
    async def notes_page(request: Request):
        return templates.TemplateResponse(
            "notes.html", {"request": request}, headers=NO_CACHE_HEADERS
        )

    @app.get("/today", response_class=HTMLResponse)
    async def today_page(request: Request):
        return templates.TemplateResponse(
            "today.html", {"request": request}, headers=NO_CACHE_HEADERS
        )


