import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from app import db, instagram
from app.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def ig_app(monkeypatch):
    monkeypatch.setattr(settings, "ig_app_id", "123")
    monkeypatch.setattr(settings, "ig_app_secret", "s3cret")
    monkeypatch.setattr(settings, "public_base_url", "https://reels.example.com")


def fake_instagram(calls: list):
    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        if req.url.host == "api.instagram.com":
            form = parse_qs(req.content.decode())
            assert form["code"] == ["abc"] and form["redirect_uri"] == ["https://reels.example.com/api/instagram/callback"]
            return httpx.Response(200, json={"data": [{"access_token": "short", "user_id": "999", "permissions": "x"}]})
        if req.url.path == "/access_token":
            assert req.url.params["access_token"] == "short"
            return httpx.Response(200, json={"access_token": "long", "token_type": "bearer", "expires_in": 5183944})
        if req.url.path.endswith("/me"):
            return httpx.Response(200, json={"data": [{"user_id": "1784", "username": "tiere.daily"}]})
        if req.url.path == "/refresh_access_token":
            return httpx.Response(200, json={"access_token": "long2", "token_type": "bearer", "expires_in": 5183944})
        return httpx.Response(404, json={"error": {"message": "unexpected"}})
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_state_roundtrip_and_tamper():
    s = instagram.make_state(7)
    assert instagram.read_state(s) == 7
    with pytest.raises(instagram.InstagramError):
        instagram.read_state(s[:-1] + ("0" if s[-1] != "0" else "1"))


def test_authorize_url():
    q = parse_qs(urlparse(instagram.authorize_url(3)).query)
    assert q["client_id"] == ["123"] and q["response_type"] == ["code"]
    assert q["redirect_uri"] == ["https://reels.example.com/api/instagram/callback"]
    assert q["scope"] == ["instagram_business_basic,instagram_business_content_publish"]
    assert instagram.read_state(q["state"][0]) == 3


def test_connect_existing_and_new_account():
    aid = db.save_account({"name": "Tiere"})
    calls = []
    assert instagram.connect_account(aid, "abc#_", fake_instagram(calls)) == aid
    acc = db.get_account(aid)
    assert acc["access_token"] == "long" and acc["ig_user_id"] == "1784" and acc["ig_username"] == "tiere.daily"
    assert datetime.fromisoformat(acc["token_expires_at"]) > datetime.now(timezone.utc) + timedelta(days=59)
    # without account id: same Instagram user -> same account, not a duplicate
    assert instagram.connect_account(None, "abc", fake_instagram([])) == aid
    db.save_account({"ig_user_id": "other"}, aid)
    new = instagram.connect_account(None, "abc", fake_instagram([]))
    assert new != aid and db.get_account(new)["name"] == "tiere.daily"


def test_callback_route(monkeypatch):
    aid = db.save_account({"name": "Tiere"})
    seen = {}
    monkeypatch.setattr(instagram, "connect_account", lambda a, code: seen.update(a=a, code=code) or a)
    c = TestClient(app)
    r = c.get("/api/instagram/callback", params={"code": "abc", "state": instagram.make_state(aid)}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == f"/account?id={aid}&ig=connected"
    assert seen == {"a": aid, "code": "abc"}
    assert c.get("/api/instagram/callback", params={"code": "abc", "state": "x.y"}).status_code == 400
    r = c.get("/api/instagram/callback", params={"error": "access_denied", "state": instagram.make_state(aid)},
              follow_redirects=False)
    assert "ig=error" in r.headers["location"]


def test_connect_redirect():
    r = TestClient(app).get("/ui-api/instagram/connect", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].startswith("https://www.instagram.com/oauth/authorize?")


def test_refresh_due_tokens():
    now = datetime.now(timezone.utc)
    soon = db.save_account({"name": "a", "access_token": "t", "token_expires_at": (now + timedelta(days=5)).isoformat(),
                            "token_refreshed_at": (now - timedelta(days=55)).isoformat()})
    db.save_account({"name": "b", "access_token": "t", "token_expires_at": (now + timedelta(days=50)).isoformat()})
    db.save_account({"name": "c", "access_token": "t"})  # manual token, expiry unknown
    assert instagram.refresh_due_tokens(fake_instagram([])) == [soon]
    assert db.get_account(soon)["access_token"] == "long2"


def _signed(payload: dict) -> str:
    p = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = base64.urlsafe_b64encode(hmac.new(b"s3cret", p.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return f"{sig}.{p}"


def test_deauthorize_and_deletion():
    aid = db.save_account({"name": "a", "ig_user_id": "1784", "access_token": "t"})
    c = TestClient(app)
    assert c.post("/api/instagram/deauthorize", data={"signed_request": "bad.sig"}).status_code == 400
    assert c.post("/api/instagram/deauthorize", data={"signed_request": _signed({"user_id": "1784"})}).json() == {"ok": True}
    assert db.get_account(aid)["access_token"] == ""
    r = c.post("/api/instagram/data-deletion", data={"signed_request": _signed({"user_id": "1784"})}).json()
    assert r["confirmation_code"] and r["url"].startswith("https://reels.example.com/")
