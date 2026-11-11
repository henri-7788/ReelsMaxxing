"""Reels-Manager: web UI + API for n8n."""
import base64
import logging
import secrets
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Form, Header, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from . import db, pipeline, scheduler
from .config import settings
from .reddit import RedditError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("reels")

BASE = Path(__file__).parent


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    pipeline.cleanup_media()
    yield


app = FastAPI(title="Reels-Manager", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=BASE / "templates")

PUBLIC_PREFIXES = ("/media/", "/health", "/static/", "/api/")


@app.middleware("http")
async def ui_basic_auth(request: Request, call_next):
    """Optional basic auth for the UI. /api uses its own key, /media must stay public for Instagram."""
    if settings.ui_user and not request.url.path.startswith(PUBLIC_PREFIXES):
        ok = False
        header = request.headers.get("authorization", "")
        if header.startswith("Basic "):
            try:
                user, _, pw = base64.b64decode(header[6:]).decode().partition(":")
                ok = secrets.compare_digest(user, settings.ui_user) and secrets.compare_digest(pw, settings.ui_password)
            except Exception:
                ok = False
        if not ok:
            return HTMLResponse("Login erforderlich", status_code=401,
                                headers={"WWW-Authenticate": 'Basic realm="Reels-Manager"'})
    return await call_next(request)


def require_api_key(x_api_key: str = Header(default="")) -> None:
    if not settings.api_key:
        raise HTTPException(503, "API_KEY ist nicht gesetzt")
    if not secrets.compare_digest(x_api_key, settings.api_key):
        raise HTTPException(401, "Falscher API-Key")


# --------------------------------------------------------------------- media
@app.get("/media/{name}")
def media(name: str):
    path = (settings.media_dir / name).resolve()
    if path.parent != settings.media_dir.resolve() or not path.is_file() or path.suffix != ".mp4":
        raise HTTPException(404)
    return FileResponse(path, media_type="video/mp4")


@app.get("/health")
def health():
    return {"ok": True}


# ----------------------------------------------------------------------- API
class PrepareBody(BaseModel):
    slot: str | None = None


class ResultBody(BaseModel):
    status: str
    ig_media_id: str | None = None
    error: str | None = None


@app.get("/api/due", dependencies=[Depends(require_api_key)])
def api_due():
    return {"due": scheduler.due_accounts()}


@app.post("/api/accounts/{account_id}/prepare", dependencies=[Depends(require_api_key)])
def api_prepare(account_id: int, body: PrepareBody | None = None):
    slot = body.slot if body else None
    try:
        return pipeline.prepare(account_id, slot)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except pipeline.NothingFound as e:
        return {"skipped": True, "reason": str(e), "account_id": account_id}
    except RedditError as e:
        raise HTTPException(502, f"Reddit: {e}")
    except Exception as e:  # render/download errors -> n8n error workflow
        log.exception("prepare fehlgeschlagen")
        raise HTTPException(500, f"Vorbereitung fehlgeschlagen: {e}")


@app.post("/api/posts/{post_id}/result", dependencies=[Depends(require_api_key)])
def api_result(post_id: int, body: ResultBody):
    try:
        return pipeline.report_result(post_id, body.status, body.ig_media_id, body.error)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/cleanup", dependencies=[Depends(require_api_key)])
def api_cleanup():
    return {"removed": pipeline.cleanup_media()}


# ------------------------------------------------------------------------ UI
def _int(v, default=0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    accounts = db.list_accounts()
    for a in accounts:
        a["sources"] = db.list_sources(a["id"])
    return templates.TemplateResponse(request, "dashboard.html", {
        "accounts": accounts, "posts": db.list_posts(15), "due": scheduler.due_accounts(),
    })


@app.get("/accounts/new", response_class=HTMLResponse)
def account_new(request: Request):
    return templates.TemplateResponse(request, "account.html", {"account": None, "sources": [], "error": None})


@app.get("/accounts/{account_id}", response_class=HTMLResponse)
def account_edit(request: Request, account_id: int):
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(404)
    return templates.TemplateResponse(request, "account.html", {
        "account": account, "sources": db.list_sources(account_id),
        "posts": db.list_posts(30, account_id), "error": None,
    })


@app.post("/accounts/save")
def account_save(request: Request, account_id: str = Form(""), name: str = Form(...), ig_user_id: str = Form(""),
                 access_token: str = Form(""), active: str = Form(""), posting_times: str = Form("18:00"),
                 caption_template: str = Form(...), hashtags: str = Form(""), hook_enabled: str = Form("")):
    try:
        scheduler.parse_times(posting_times)
    except ValueError as e:
        acc = db.get_account(_int(account_id)) if account_id else None
        return templates.TemplateResponse(request, "account.html", {
            "account": acc, "sources": db.list_sources(acc["id"]) if acc else [], "error": str(e)}, status_code=400)
    data = {"name": name.strip(), "ig_user_id": ig_user_id.strip(), "active": 1 if active else 0,
            "posting_times": posting_times.strip(), "caption_template": caption_template.replace("\r\n", "\n"),
            "hashtags": hashtags.strip(), "hook_enabled": 1 if hook_enabled else 0}
    if access_token.strip():
        data["access_token"] = access_token.strip()
    new_id = db.save_account(data, _int(account_id) if account_id else None)
    return RedirectResponse(f"/accounts/{new_id}", status_code=303)


@app.post("/accounts/{account_id}/delete")
def account_delete(account_id: int):
    db.delete_account(account_id)
    return RedirectResponse("/", status_code=303)


@app.post("/accounts/{account_id}/sources")
def source_add(account_id: int, subreddit: str = Form(...), sort: str = Form("top"), time_filter: str = Form("day"),
               min_score: str = Form("500"), min_duration: str = Form("5"), max_duration: str = Form("90"),
               allow_nsfw: str = Form("")):
    sub = subreddit.strip().removeprefix("r/").strip("/ ")
    if sub:
        db.add_source(account_id, {
            "subreddit": sub, "sort": sort if sort in {"top", "hot", "new", "rising"} else "top",
            "time_filter": time_filter if time_filter in {"hour", "day", "week", "month", "year", "all"} else "day",
            "min_score": _int(min_score, 500), "min_duration": _int(min_duration, 5),
            "max_duration": min(_int(max_duration, 90), 900), "allow_nsfw": 1 if allow_nsfw else 0,
        })
    return RedirectResponse(f"/accounts/{account_id}", status_code=303)


@app.post("/sources/{source_id}/delete")
def source_delete(source_id: int, account_id: int = Form(...)):
    db.delete_source(source_id)
    return RedirectResponse(f"/accounts/{account_id}", status_code=303)


def _preview_job(account_id: int) -> None:
    try:
        res = pipeline.prepare(account_id, slot=None)
        db.update_post(res["post_id"], status="preview")
    except Exception as e:
        log.warning("Vorschau für Account %s fehlgeschlagen: %s", account_id, e)


@app.post("/accounts/{account_id}/preview")
def account_preview(account_id: int):
    threading.Thread(target=_preview_job, args=(account_id,), daemon=True).start()
    return RedirectResponse("/posts?info=preview", status_code=303)


@app.get("/posts", response_class=HTMLResponse)
def posts(request: Request, info: str = ""):
    return templates.TemplateResponse(request, "posts.html", {"posts": db.list_posts(200), "info": info})


@app.exception_handler(404)
def not_found(request: Request, exc):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": getattr(exc, "detail", "Not Found")}, status_code=404)
    return HTMLResponse("Nicht gefunden", status_code=404)
