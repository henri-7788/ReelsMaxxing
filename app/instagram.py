"""Instagram API with Unified Login (Facebook Login for Business + config_id).

New Meta apps only offer this setup. Flow:
  /ui-api/instagram/connect?account_id=N -> facebook.com/dialog/oauth?client_id&config_id&redirect_uri&state
  /api/instagram/callback?code&state     -> graph.facebook.com/oauth/access_token -> business integration
                                            system user token (expiry set in the configuration, default never)
                                         -> /me?fields=client_business_id, /me/assigned_instagram_accounts
One login can share several Instagram accounts; one token covers all of them.
API calls go to graph.facebook.com/<version>/<INSTAGRAM_ACCOUNT_ID>/...
"""
import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

from . import db
from .config import settings

log = logging.getLogger("reels.instagram")

DIALOG_URL = "https://www.facebook.com/dialog/oauth"
GRAPH = "https://graph.facebook.com"
STATE_MAX_AGE = 15 * 60


class InstagramError(Exception):
    pass


def configured() -> bool:
    return bool(settings.meta_app_id and settings.meta_app_secret and settings.meta_config_id)


def redirect_uri() -> str:
    return f"{settings.public_base_url}/api/instagram/callback"


def graph_api_base() -> str:
    return f"{GRAPH}/{settings.meta_graph_version}"


# ------------------------------------------------------------------ state
def _sign(payload: bytes) -> str:
    return hmac.new(settings.meta_app_secret.encode(), payload, hashlib.sha256).hexdigest()


def make_state(account_id: int | None) -> str:
    """Signed, short-lived state so the public callback only accepts flows started from the UI."""
    data = json.dumps({"a": account_id, "t": int(time.time()), "n": secrets.token_hex(8)}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(data).decode().rstrip("=") + "." + _sign(data)


def read_state(state: str) -> int | None:
    try:
        b64, sig = state.rsplit(".", 1)
        data = base64.urlsafe_b64decode(b64 + "=" * (-len(b64) % 4))
    except (ValueError, TypeError):
        raise InstagramError("Ungültiger state-Parameter")
    if not hmac.compare_digest(sig, _sign(data)):
        raise InstagramError("state-Signatur stimmt nicht")
    payload = json.loads(data)
    if time.time() - payload["t"] > STATE_MAX_AGE:
        raise InstagramError("Anmeldung abgelaufen, bitte erneut verbinden")
    return payload["a"]


def authorize_url(account_id: int | None) -> str:
    params = {
        "client_id": settings.meta_app_id,
        "config_id": settings.meta_config_id,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "state": make_state(account_id),
        # Always offer Facebook and Instagram login instead of silently reusing the current session
        "prompt": "login",
    }
    return f"{DIALOG_URL}?{urlencode(params)}"


# ------------------------------------------------------------------ tokens
def _check(r: httpx.Response) -> dict:
    try:
        data = r.json()
    except ValueError:
        raise InstagramError(f"HTTP {r.status_code}: {r.text[:200]}")
    if r.status_code >= 400 or "error" in data:
        err = data.get("error")
        msg = err.get("message") if isinstance(err, dict) else err or r.text[:200]
        raise InstagramError(str(msg))
    return data


def exchange_code(code: str, client: httpx.Client) -> dict:
    """code -> system user token, client business id and the shared Instagram accounts."""
    base = graph_api_base()
    tok = _check(client.get(f"{base}/oauth/access_token", params={
        "client_id": settings.meta_app_id, "client_secret": settings.meta_app_secret,
        "redirect_uri": redirect_uri(), "code": code.removesuffix("#_"),
    }))
    token = tok["access_token"]
    expires = ""
    if tok.get("expires_in"):
        expires = (datetime.now(timezone.utc) + timedelta(seconds=int(tok["expires_in"]))).isoformat(timespec="seconds")
    me = _check(client.get(f"{base}/me", params={"fields": "client_business_id", "access_token": token}))
    accounts = _check(client.get(f"{base}/me/assigned_instagram_accounts",
                                 params={"fields": "id,username", "limit": 100, "access_token": token})).get("data", [])
    if not accounts:
        raise InstagramError("Es wurde kein Instagram-Konto freigegeben. Beim Login ein Instagram-Konto auswählen.")
    return {"access_token": token, "token_expires_at": expires, "client_business_id": me.get("client_business_id", ""),
            "accounts": [{"id": str(a["id"]), "username": a.get("username", "")} for a in accounts]}


def connect(account_id: int | None, code: str, client: httpx.Client | None = None) -> list[int]:
    """Store the token on every Reels-Manager account matching a shared Instagram account.

    The account the flow was started from gets the first shared Instagram account that is not already
    linked elsewhere; Instagram accounts without a match become new (paused) accounts.
    Returns the ids of all touched accounts, the started-from account first.
    """
    with client or httpx.Client(timeout=30, follow_redirects=True) as c:
        touched = _store_connection(account_id, exchange_code(code, c))
        for aid in touched:
            acc = db.get_account(aid)
            if acc:
                refresh_avatar(acc, client=c, force=True)
    return touched


def _store_connection(account_id: int | None, res: dict) -> list[int]:
    common = {"access_token": res["access_token"], "token_expires_at": res["token_expires_at"],
              "client_business_id": res["client_business_id"], "token_refreshed_at": db.now_iso()}
    if account_id is not None and not db.get_account(account_id):
        account_id = None
    touched: list[int] = []
    target_free = account_id is not None
    for ig in res["accounts"]:
        fields = {**common, "ig_user_id": ig["id"], "ig_username": ig["username"]}
        existing = db.row("SELECT id FROM accounts WHERE ig_user_id = ?", (ig["id"],))
        if existing:
            touched.append(db.save_account(fields, existing["id"]))
            if existing["id"] == account_id:
                target_free = False
        elif target_free:
            touched.append(db.save_account(fields, account_id))
            target_free = False
        else:
            touched.append(db.save_account({**fields, "name": ig["username"] or "Instagram", "active": 0}))
    if account_id in touched:
        touched.remove(account_id)
        touched.insert(0, account_id)
    return touched


# ------------------------------------------------------- Meta callbacks
def parse_signed_request(signed_request: str) -> dict:
    """Meta's signed_request (deauthorize / data deletion): base64url(sig).base64url(json), HMAC-SHA256 with app secret."""
    try:
        sig_b64, payload_b64 = signed_request.split(".", 1)
        sig = base64.urlsafe_b64decode(sig_b64 + "=" * (-len(sig_b64) % 4))
        payload = base64.urlsafe_b64decode(payload_b64 + "=" * (-len(payload_b64) % 4))
    except (ValueError, TypeError):
        raise InstagramError("signed_request ungültig")
    expected = hmac.new(settings.meta_app_secret.encode(), payload_b64.encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise InstagramError("signed_request-Signatur stimmt nicht")
    return json.loads(payload)


def disconnect(data: dict) -> int:
    """Forget tokens matching the ids Meta sends (Instagram account id, user id or business id)."""
    ids = {str(v) for k, v in data.items() if k in {"user_id", "instagram_account_id", "business_id", "client_business_id"} and v}
    if not ids:
        return 0
    marks = ",".join("?" * len(ids))
    accounts = db.rows(f"SELECT id FROM accounts WHERE ig_user_id IN ({marks}) OR"
                       f" (client_business_id != '' AND client_business_id IN ({marks}))", (*ids, *ids))
    for a in accounts:
        clear_token(a["id"])
    return len(accounts)


def clear_token(account_id: int) -> None:
    db.save_account({"access_token": "", "token_expires_at": "", "token_refreshed_at": ""}, account_id)
    delete_avatar(account_id)


# ------------------------------------------------------- profile pictures
# Instagram CDN URLs expire, so the picture is downloaded and kept under DATA_DIR/avatars.
AVATAR_MAX_AGE = 24 * 3600
AVATAR_RETRY_AFTER = 3600
AVATAR_MAX_BYTES = 5 * 1024 * 1024
_avatar_failed: dict[int, float] = {}


def avatar_path(account_id: int):
    return settings.data_dir / "avatars" / f"{account_id}.jpg"


def avatar_version(account_id: int) -> int | None:
    """mtime of the cached picture (for cache busting in the UI), None if there is none."""
    p = avatar_path(account_id)
    return int(p.stat().st_mtime) if p.is_file() else None


def refresh_avatar(account: dict, client: httpx.Client | None = None, force: bool = False):
    """Download the profile picture if it is missing or older than a day. Returns the file path or None.
    Failures are logged and retried at most once per hour; an old picture is kept in that case."""
    path = avatar_path(account["id"])
    fresh = path.is_file() and time.time() - path.stat().st_mtime < AVATAR_MAX_AGE
    if fresh and not force:
        return path
    if not account.get("ig_user_id") or not account.get("access_token"):
        return path if path.is_file() else None
    if not force and time.time() - _avatar_failed.get(account["id"], 0) < AVATAR_RETRY_AFTER:
        return path if path.is_file() else None
    try:
        c = client or httpx.Client(timeout=15, follow_redirects=True)
        try:
            data = _check(c.get(f"{graph_api_base()}/{account['ig_user_id']}",
                                params={"fields": "profile_picture_url", "access_token": account["access_token"]}))
            url = data.get("profile_picture_url")
            if not url:
                raise InstagramError("kein Profilbild")
            r = c.get(url)
            r.raise_for_status()
            if not r.headers.get("content-type", "image/").startswith("image/") or len(r.content) > AVATAR_MAX_BYTES:
                raise InstagramError("Profilbild hat ein unerwartetes Format")
        finally:
            if client is None:
                c.close()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(r.content)
        tmp.replace(path)
        _avatar_failed.pop(account["id"], None)
        return path
    except (InstagramError, httpx.HTTPError) as e:
        log.info("Profilbild für Account %s nicht geladen: %s", account["id"], e)
        _avatar_failed[account["id"]] = time.time()
        if path.is_file():
            path.touch()  # keep the old picture another day instead of retrying on every page view
            return path
        return None


def delete_avatar(account_id: int) -> None:
    avatar_path(account_id).unlink(missing_ok=True)
    _avatar_failed.pop(account_id, None)


# ------------------------------------------------------------------ publishing
# Used by the manual "Start" run in the UI. Scheduled posts still go through n8n with the same three calls.
PUBLISH_POLL_SECONDS = 10
PUBLISH_TIMEOUT_SECONDS = 15 * 60


class ProcessingError(InstagramError):
    """Instagram accepted the container but could not fetch or process the video (status ERROR/EXPIRED)."""


def _wait_and_publish(c: httpx.Client, base: str, ig_user_id: str, token: str, container: str, sleep) -> str:
    waited = 0
    while True:
        st = _check(c.get(f"{base}/{container}", params={"fields": "status_code,status", "access_token": token}))
        code = st.get("status_code")
        if code == "FINISHED":
            break
        if code in {"ERROR", "EXPIRED"}:
            raise ProcessingError(f"Instagram konnte das Video nicht verarbeiten: {st.get('status') or code}")
        if waited >= PUBLISH_TIMEOUT_SECONDS:
            raise InstagramError("Instagram hat das Video nicht rechtzeitig verarbeitet (Zeitüberschreitung)")
        sleep(PUBLISH_POLL_SECONDS)
        waited += PUBLISH_POLL_SECONDS
    return str(_check(c.post(f"{base}/{ig_user_id}/media_publish",
                             data={"creation_id": container, "access_token": token}))["id"])


def upload_url(container: str) -> str:
    return f"https://rupload.facebook.com/ig-api-upload/{settings.meta_graph_version}/{container}"


def _publish_from_url(c, base, ig_user_id, token, video_url, caption, sleep) -> str:
    """Instagram downloads the video from our public /media URL."""
    container = _check(c.post(f"{base}/{ig_user_id}/media", data={
        "media_type": "REELS", "video_url": video_url, "caption": caption,
        "share_to_feed": "true", "access_token": token,
    }))["id"]
    return _wait_and_publish(c, base, ig_user_id, token, container, sleep)


def _publish_upload(c, base, ig_user_id, token, video_path, caption, sleep) -> str:
    """Resumable upload: we send the file to Meta ourselves, no public URL needed."""
    res = _check(c.post(f"{base}/{ig_user_id}/media", data={
        "media_type": "REELS", "upload_type": "resumable", "caption": caption,
        "share_to_feed": "true", "access_token": token,
    }))
    container = res["id"]
    data = video_path.read_bytes()
    _check(c.post(res.get("uri") or upload_url(container), content=data, timeout=600, headers={
        "Authorization": f"OAuth {token}", "offset": "0", "file_size": str(len(data)),
        "Content-Type": "application/octet-stream",
    }))
    return _wait_and_publish(c, base, ig_user_id, token, container, sleep)


def publish_reel(ig_user_id: str, token: str, video_url: str, caption: str,
                 client: httpx.Client | None = None, sleep=time.sleep, video_path=None) -> str:
    """Create a REELS container, wait until Instagram has processed the video, publish it.

    INSTAGRAM_UPLOAD=auto (default): Instagram fetches video_url; if that fails (e.g. error 2207077,
    Meta could not or would not load the link, often because of Cloudflare in front of /media), the
    file at video_path is uploaded directly instead. "url" / "upload" force one way.
    Returns the Instagram media id. Raises InstagramError on any API error or when processing times out.
    """
    base = graph_api_base()
    mode = settings.instagram_upload
    c = client or httpx.Client(timeout=60, follow_redirects=True)
    try:
        if mode == "upload" and video_path:
            return _publish_upload(c, base, ig_user_id, token, video_path, caption, sleep)
        try:
            return _publish_from_url(c, base, ig_user_id, token, video_url, caption, sleep)
        except ProcessingError as e:
            if mode == "url" or not video_path or not video_path.is_file():
                raise
            log.warning("Instagram konnte den Link nicht verarbeiten (%s), lade die Datei direkt hoch", e)
            try:
                return _publish_upload(c, base, ig_user_id, token, video_path, caption, sleep)
            except InstagramError as e2:
                raise InstagramError(f"{e} / Direkt-Upload: {e2}") from e2
    finally:
        if client is None:
            c.close()
