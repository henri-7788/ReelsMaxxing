"""Reels-Manager: web UI + API for n8n."""
import base64
import logging
import secrets
import threading
from urllib.parse import urlencode
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db, instagram, pipeline, scheduler, stats, system
from .config import settings
from .reddit import RedditError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("reels")

BASE = Path(__file__).parent


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    pipeline.cleanup_media()
    system.start_sampler()
    instagram.start_refresher()
    yield


app = FastAPI(title="Reels-Manager", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)
# Prebuilt Next.js static export (web/ -> `next build` -> copied here in the Dockerfile)
WEB_DIR = Path(settings.web_dir) if settings.web_dir else BASE / "web"
if (WEB_DIR / "_next").is_dir():
    app.mount("/_next", StaticFiles(directory=WEB_DIR / "_next"), name="next-assets")

PUBLIC_PREFIXES = ("/media/", "/health", "/api/")


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
    system.mark_n8n_poll()
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


# ----------------------------------------------------------- Instagram Login
# These are public (no API key / basic auth): Instagram redirects the browser here, Meta calls the
# other two server-to-server. They are protected by the signed state / signed_request instead.
def _back_to_ui(account_id: int | None, result: str, message: str = "") -> RedirectResponse:
    params = {"ig": result}
    if message:
        params["ig_message"] = message[:300]
    path = f"/account?id={account_id}&" if account_id else "/accounts?"
    return RedirectResponse(path + urlencode(params), status_code=303)


@app.get("/api/instagram/callback")
def api_instagram_callback(code: str = "", state: str = "", error: str = "", error_description: str = ""):
    if not instagram.configured():
        raise HTTPException(503, "IG_APP_ID / IG_APP_SECRET sind nicht gesetzt")
    try:
        account_id = instagram.read_state(state)
    except instagram.InstagramError as e:
        raise HTTPException(400, str(e))
    if error or not code:
        return _back_to_ui(account_id, "error", error_description or error or "Kein Code von Instagram erhalten")
    try:
        account_id = instagram.connect_account(account_id, code)
    except (instagram.InstagramError, httpx.HTTPError) as e:
        log.warning("Instagram-Verbindung fehlgeschlagen: %s", e)
        return _back_to_ui(account_id, "error", str(e))
    return _back_to_ui(account_id, "connected")


async def _signed_request(request: Request) -> dict:
    form = await request.form()
    try:
        return instagram.parse_signed_request(str(form.get("signed_request", "")))
    except (instagram.InstagramError, ValueError) as e:
        raise HTTPException(400, str(e))


@app.post("/api/instagram/deauthorize")
async def api_instagram_deauthorize(request: Request):
    data = await _signed_request(request)
    instagram.disconnect_user(str(data.get("user_id", "")))
    return {"ok": True}


@app.post("/api/instagram/data-deletion")
async def api_instagram_data_deletion(request: Request):
    data = await _signed_request(request)
    instagram.disconnect_user(str(data.get("user_id", "")))
    code = secrets.token_hex(8)
    return {"url": f"{settings.public_base_url}/api/instagram/data-deletion?code={code}", "confirmation_code": code}


@app.get("/api/instagram/data-deletion")
def api_instagram_data_deletion_status(code: str = ""):
    return {"confirmation_code": code, "status": "Der Instagram-Token wurde gelöscht."}


@app.post("/api/cleanup", dependencies=[Depends(require_api_key)])
def api_cleanup():
    return {"removed": pipeline.cleanup_media()}


# -------------------------------------------------------- UI (JSON for web/)
# Same protection as the pages (basic auth / Cloudflare Access), not the n8n API key.
ui = APIRouter(prefix="/ui-api")

SORTS = {"top", "hot", "new", "rising"}
TIME_FILTERS = {"hour", "day", "week", "month", "year", "all"}


class AccountBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    ig_user_id: str = ""
    access_token: str = ""  # empty = keep the stored token
    active: bool = True
    posting_times: str = "18:00"
    caption_template: str = "{title}"
    hashtags: str = ""
    hook_enabled: bool = True


class SourceBody(BaseModel):
    subreddit: str
    sort: str = "top"
    time_filter: str = "day"
    min_score: int = 500
    min_duration: int = 5
    max_duration: int = 90
    allow_nsfw: bool = False


def _public_account(a: dict) -> dict:
    """Never send the Instagram token to the browser."""
    out = {k: v for k, v in a.items() if k != "access_token"}
    out["has_token"] = bool(a.get("access_token"))
    out["active"] = bool(a["active"])
    out["hook_enabled"] = bool(a["hook_enabled"])
    out["next_slot"] = scheduler.next_slot(a) if a["active"] else None
    return out


def _account_or_404(account_id: int) -> dict:
    acc = db.get_account(account_id)
    if not acc:
        raise HTTPException(404, "Account nicht gefunden")
    return acc


@ui.get("/overview")
def ui_overview():
    accounts = [_public_account(a) for a in db.list_accounts()]
    for a in accounts:
        a["sources"] = db.list_sources(a["id"])
    return {"accounts": accounts, "posts": db.list_posts(15), "due": scheduler.due_accounts(),
            "stats": db.post_stats()}


@ui.get("/posts")
def ui_posts(limit: int = 200, account_id: int | None = None):
    return {"posts": db.list_posts(max(1, min(limit, 500)), account_id)}


@ui.get("/stats")
def ui_stats(account_id: int | None = None, days: int = 30):
    return stats.summary(account_id, max(1, min(days, 366)))


@ui.get("/system")
def ui_system():
    return system.snapshot()


@ui.get("/instagram/connect")
def ui_instagram_connect(account_id: int | None = None):
    """Start Instagram Login for an account (or without id: create a new account from the login)."""
    if not instagram.configured():
        raise HTTPException(503, "IG_APP_ID und IG_APP_SECRET im Container setzen, dann geht der Login")
    if account_id is not None:
        _account_or_404(account_id)
    return RedirectResponse(instagram.authorize_url(account_id), status_code=303)


@ui.post("/accounts/{account_id}/instagram/refresh")
def ui_instagram_refresh(account_id: int):
    acc = _account_or_404(account_id)
    if not acc["access_token"]:
        raise HTTPException(400, "Kein Token gespeichert")
    try:
        with httpx.Client(timeout=30) as c:
            instagram.refresh_token(acc, c)
    except (instagram.InstagramError, httpx.HTTPError) as e:
        raise HTTPException(502, f"Instagram: {e}")
    return _public_account(db.get_account(account_id))


@ui.post("/accounts/{account_id}/instagram/disconnect")
def ui_instagram_disconnect(account_id: int):
    _account_or_404(account_id)
    db.save_account({"access_token": "", "token_expires_at": "", "token_refreshed_at": ""}, account_id)
    return _public_account(db.get_account(account_id))


@ui.get("/settings")
def ui_settings():
    """Read-only view of the configuration. Secrets are never sent, only whether they are set."""
    return {
        "reddit": {"configured": bool(settings.reddit_client_id and settings.reddit_client_secret),
                   "client_id_set": bool(settings.reddit_client_id), "secret_set": bool(settings.reddit_client_secret),
                   "user_agent": settings.reddit_user_agent},
        "instagram": {"configured": instagram.configured(), "app_id": settings.ig_app_id,
                      "redirect_uri": instagram.redirect_uri(),
                      "deauthorize_url": f"{settings.public_base_url}/api/instagram/deauthorize",
                      "data_deletion_url": f"{settings.public_base_url}/api/instagram/data-deletion",
                      "graph_api_base": instagram.graph_api_base()},
        "api": {"key_set": bool(settings.api_key), "public_base_url": settings.public_base_url,
                "last_n8n_poll": system.snapshot()["last_n8n_poll"]},
        "ui_auth": bool(settings.ui_user),
        "render": {"encoder": settings.encoder, "x264_preset": settings.x264_preset, "width": 1080, "height": 1920,
                   "loudness_lufs": -14},
        "automation": {"slot_window_minutes": settings.slot_window_minutes,
                       "max_attempts_per_slot": scheduler.MAX_ATTEMPTS_PER_SLOT,
                       "media_retention_hours": settings.media_retention_hours},
        "timezone": settings.timezone,
        "data_dir": str(settings.data_dir),
    }


@ui.post("/cleanup")
def ui_cleanup():
    return {"removed": pipeline.cleanup_media()}


@ui.get("/accounts/{account_id}")
def ui_account(account_id: int):
    acc = _account_or_404(account_id)
    return {"account": _public_account(acc), "sources": db.list_sources(account_id),
            "posts": db.list_posts(30, account_id)}


def _save(body: AccountBody, account_id: int | None) -> dict:
    try:
        scheduler.parse_times(body.posting_times)
    except ValueError as e:
        raise HTTPException(400, str(e))
    data = {"name": body.name.strip(), "ig_user_id": body.ig_user_id.strip(), "active": int(body.active),
            "posting_times": body.posting_times.strip(), "caption_template": body.caption_template.replace("\r\n", "\n"),
            "hashtags": body.hashtags.strip(), "hook_enabled": int(body.hook_enabled)}
    if body.access_token.strip():
        # Pasted manually: expiry unknown, the refresher leaves it alone
        data.update(access_token=body.access_token.strip(), token_expires_at="", token_refreshed_at="")
    new_id = db.save_account(data, account_id)
    return _public_account(db.get_account(new_id))


@ui.post("/accounts")
def ui_account_create(body: AccountBody):
    return _save(body, None)


@ui.put("/accounts/{account_id}")
def ui_account_update(account_id: int, body: AccountBody):
    _account_or_404(account_id)
    return _save(body, account_id)


@ui.delete("/accounts/{account_id}")
def ui_account_delete(account_id: int):
    db.delete_account(account_id)
    return {"ok": True}


@ui.post("/accounts/{account_id}/sources")
def ui_source_add(account_id: int, body: SourceBody):
    _account_or_404(account_id)
    sub = body.subreddit.strip().removeprefix("r/").strip("/ ")
    if not sub:
        raise HTTPException(400, "Subreddit fehlt")
    db.add_source(account_id, {
        "subreddit": sub, "sort": body.sort if body.sort in SORTS else "top",
        "time_filter": body.time_filter if body.time_filter in TIME_FILTERS else "day",
        "min_score": max(0, body.min_score), "min_duration": max(0, body.min_duration),
        "max_duration": min(max(1, body.max_duration), 900), "allow_nsfw": int(body.allow_nsfw),
    })
    return {"sources": db.list_sources(account_id)}


@ui.delete("/sources/{source_id}")
def ui_source_delete(source_id: int):
    db.delete_source(source_id)
    return {"ok": True}


def _preview_job(account_id: int) -> None:
    try:
        res = pipeline.prepare(account_id, slot=None)
        db.update_post(res["post_id"], status="preview")
    except Exception as e:
        log.warning("Vorschau für Account %s fehlgeschlagen: %s", account_id, e)


@ui.post("/accounts/{account_id}/preview")
def ui_preview(account_id: int):
    _account_or_404(account_id)
    threading.Thread(target=_preview_job, args=(account_id,), daemon=True).start()
    return {"started": True}


app.include_router(ui)


# --------------------------------------------------------------- UI (pages)
def _page(name: str):
    path = WEB_DIR / name
    if not path.is_file():
        return HTMLResponse("Weboberfläche nicht gebaut (web/ → npm run build). Die API läuft trotzdem.",
                            status_code=503)
    return FileResponse(path, media_type="text/html", headers={"Cache-Control": "no-cache"})


@app.api_route("/", methods=["GET", "HEAD"], response_class=HTMLResponse)
def page_dashboard():
    return _page("index.html")


@app.api_route("/posts", methods=["GET", "HEAD"], response_class=HTMLResponse)
def page_posts():
    return _page("posts.html")


@app.api_route("/account", methods=["GET", "HEAD"], response_class=HTMLResponse)
def page_account():
    return _page("account.html")


# Old links from the previous UI
@app.get("/accounts/new")
def page_account_new():
    return RedirectResponse("/account", status_code=307)


@app.get("/accounts/{account_id:int}")
def page_account_legacy(account_id: int):
    return RedirectResponse(f"/account?id={account_id}", status_code=307)


@app.api_route("/{path:path}", methods=["GET", "HEAD"])
def web_file(path: str):
    """Everything else of the export: icon, RSC payloads for client-side navigation (*.txt) ..."""
    root = WEB_DIR.resolve()
    target = (root / path).resolve()
    if not target.is_relative_to(root) or not target.is_file() or target.suffix == ".html":
        html = (root / f"{path}.html").resolve()
        if path and html.is_relative_to(root) and html.is_file():
            return _page(html.name if html.parent == root else str(html.relative_to(root)))
        raise HTTPException(404)
    return FileResponse(target)


@app.exception_handler(404)
def not_found(request: Request, exc):
    if request.url.path.startswith(("/api/", "/ui-api/", "/media/", "/_next/")):
        return JSONResponse({"detail": getattr(exc, "detail", "Not Found")}, status_code=404)
    page = WEB_DIR / "404.html"
    if page.is_file():
        return HTMLResponse(page.read_text(encoding="utf-8"), status_code=404)
    return HTMLResponse("Nicht gefunden", status_code=404)
