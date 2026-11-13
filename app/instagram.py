"""Instagram API with Instagram Login: OAuth connect, long-lived tokens and automatic refresh.

Flow (one Instagram account per Reels-Manager account):
  /ui-api/instagram/connect?account_id=N  -> redirect to instagram.com/oauth/authorize
  /api/instagram/callback?code&state      -> code -> short-lived token -> long-lived token (60 days)
                                            -> /me (user_id, username) -> stored on the account
A background thread refreshes tokens before they expire (Meta allows refresh once a token is 24 h old).
"""
import base64
import hashlib
import hmac
import json
import logging
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

from . import db
from .config import settings

log = logging.getLogger("reels.instagram")

AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize"
TOKEN_URL = "https://api.instagram.com/oauth/access_token"
GRAPH = "https://graph.instagram.com"
SCOPES = ("instagram_business_basic", "instagram_business_content_publish")
STATE_MAX_AGE = 15 * 60
REFRESH_BEFORE = timedelta(days=15)
REFRESH_MIN_AGE = timedelta(hours=25)


class InstagramError(Exception):
    pass


def configured() -> bool:
    return bool(settings.ig_app_id and settings.ig_app_secret)


def redirect_uri() -> str:
    return f"{settings.public_base_url}/api/instagram/callback"


def graph_api_base() -> str:
    return f"{GRAPH}/{settings.ig_graph_version}"


# ------------------------------------------------------------------ state
def _sign(payload: bytes) -> str:
    return hmac.new(settings.ig_app_secret.encode(), payload, hashlib.sha256).hexdigest()


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
        "client_id": settings.ig_app_id,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": ",".join(SCOPES),
        "state": make_state(account_id),
        # Always ask which Instagram account, otherwise the last logged-in one is reused silently
        "force_reauth": "true",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


# ------------------------------------------------------------------ tokens
def _check(r: httpx.Response) -> dict:
    try:
        data = r.json()
    except ValueError:
        raise InstagramError(f"HTTP {r.status_code}: {r.text[:200]}")
    if r.status_code >= 400 or "error" in data or "error_type" in data:
        err = data.get("error")
        msg = err.get("message") if isinstance(err, dict) else data.get("error_message") or err or r.text[:200]
        raise InstagramError(str(msg))
    return data


def _expires(seconds: int | None) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=int(seconds or 60 * 86400))).isoformat(timespec="seconds")


def exchange_code(code: str, client: httpx.Client) -> dict:
    """code -> short-lived token -> long-lived token + profile. Returns fields to store on the account."""
    code = code.removesuffix("#_")
    short = _check(client.post(TOKEN_URL, data={
        "client_id": settings.ig_app_id, "client_secret": settings.ig_app_secret,
        "grant_type": "authorization_code", "redirect_uri": redirect_uri(), "code": code,
    }))
    if "data" in short:  # older response shape
        short = short["data"][0]
    long = _check(client.get(f"{GRAPH}/access_token", params={
        "grant_type": "ig_exchange_token", "client_secret": settings.ig_app_secret,
        "access_token": short["access_token"],
    }))
    token = long["access_token"]
    me = _check(client.get(f"{graph_api_base()}/me", params={
        "fields": "user_id,username", "access_token": token,
    }))
    if "data" in me:  # the docs show /me wrapped in a data list
        me = me["data"][0]
    return {
        "ig_user_id": str(me.get("user_id") or short.get("user_id") or me.get("id")),
        "ig_username": me.get("username", ""),
        "access_token": token,
        "token_expires_at": _expires(long.get("expires_in")),
        "token_refreshed_at": db.now_iso(),
    }


def connect_account(account_id: int | None, code: str, client: httpx.Client | None = None) -> int:
    with client or httpx.Client(timeout=30) as c:
        fields = exchange_code(code, c)
    if account_id is not None and not db.get_account(account_id):
        account_id = None
    if account_id is None:
        existing = db.row("SELECT id FROM accounts WHERE ig_user_id = ?", (fields["ig_user_id"],))
        if existing:
            account_id = existing["id"]
        else:
            fields["name"] = fields["ig_username"] or "Instagram"
            fields["active"] = 0  # no sources yet
    return db.save_account(fields, account_id)


def refresh_token(account: dict, client: httpx.Client) -> None:
    data = _check(client.get(f"{GRAPH}/refresh_access_token", params={
        "grant_type": "ig_refresh_token", "access_token": account["access_token"],
    }))
    db.save_account({"access_token": data["access_token"], "token_expires_at": _expires(data.get("expires_in")),
                     "token_refreshed_at": db.now_iso()}, account["id"])


def _parse(ts: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(ts) if ts else None
    except ValueError:
        return None


def refresh_due_tokens(client: httpx.Client | None = None) -> list[int]:
    """Refresh every token that expires within REFRESH_BEFORE and is old enough to be refreshed."""
    now = datetime.now(timezone.utc)
    done = []
    with client or httpx.Client(timeout=30) as c:
        for acc in db.list_accounts():
            exp, ref = _parse(acc.get("token_expires_at")), _parse(acc.get("token_refreshed_at"))
            if not acc["access_token"] or not exp or exp - now > REFRESH_BEFORE or exp < now:
                continue
            if ref and now - ref < REFRESH_MIN_AGE:
                continue
            try:
                refresh_token(acc, c)
                done.append(acc["id"])
                log.info("Instagram-Token für %s erneuert", acc["name"])
            except Exception as e:
                log.warning("Token-Erneuerung für %s fehlgeschlagen: %s", acc["name"], e)
    return done


def _refresher() -> None:
    while True:
        try:
            refresh_due_tokens()
        except Exception:
            log.exception("Token-Refresh-Lauf fehlgeschlagen")
        time.sleep(6 * 3600)


def start_refresher() -> None:
    if configured():
        threading.Thread(target=_refresher, daemon=True, name="ig-token-refresh").start()


# ------------------------------------------------------- Meta callbacks
def parse_signed_request(signed_request: str) -> dict:
    """Meta's signed_request (deauthorize / data deletion): base64url(sig).base64url(json), HMAC-SHA256 with app secret."""
    try:
        sig_b64, payload_b64 = signed_request.split(".", 1)
        sig = base64.urlsafe_b64decode(sig_b64 + "=" * (-len(sig_b64) % 4))
        payload = base64.urlsafe_b64decode(payload_b64 + "=" * (-len(payload_b64) % 4))
    except (ValueError, TypeError):
        raise InstagramError("signed_request ungültig")
    expected = hmac.new(settings.ig_app_secret.encode(), payload_b64.encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise InstagramError("signed_request-Signatur stimmt nicht")
    return json.loads(payload)


def disconnect_user(ig_user_id: str) -> int:
    """Forget the token of an Instagram user (they removed the app or asked for deletion)."""
    accounts = db.rows("SELECT id FROM accounts WHERE ig_user_id = ?", (str(ig_user_id),))
    for a in accounts:
        db.save_account({"access_token": "", "token_expires_at": "", "token_refreshed_at": ""}, a["id"])
    return len(accounts)
