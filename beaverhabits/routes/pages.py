import time
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, select

from beaverhabits.app.db import User, get_async_session

PROJECT_ROOT = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=PROJECT_ROOT / "templates")

# Cache-bust static assets across deploys: changes on every server start.
ASSET_VERSION = str(int(time.time()))
templates.env.globals["asset_version"] = ASSET_VERSION

NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
}


async def _has_user(session) -> bool:
    result = await session.execute(select(func.count()).select_from(User))
    return result.scalar_one() > 0


def init_page_routes(app: FastAPI) -> None:
    @app.get("/login", response_class=HTMLResponse)
    async def login_page(request: Request, session=Depends(get_async_session)):
        setup_required = not await _has_user(session)
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "setup_required": setup_required},
            headers=NO_CACHE_HEADERS,
        )

    @app.get("/", response_class=HTMLResponse)
    async def index_page(request: Request):
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

