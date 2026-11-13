import base64
import hashlib
import hmac
import json
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from app import db, instagram
from app.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def meta_app(monkeypatch):
    monkeypatch.setattr(settings, "meta_app_id", "123")
    monkeypatch.setattr(settings, "meta_app_secret", "s3cret")
    monkeypatch.setattr(settings, "meta_config_id", "cfg9")
    monkeypatch.setattr(settings, "public_base_url", "https://reels.example.com")


def fake_meta(ig_accounts, expires_in=None):
    def handler(req: httpx.Request) -> httpx.Response:
        assert req.url.host == "graph.facebook.com"
        if req.url.path.endswith("/oauth/access_token"):
            p = req.url.params
            assert p["code"] == "abc" and p["client_id"] == "123" and p["client_secret"] == "s3cret"
            assert p["redirect_uri"] == "https://reels.example.com/api/instagram/callback"
            body = {"access_token": "suat", "token_type": "bearer"}
            if expires_in:
                body["expires_in"] = expires_in
            return httpx.Response(200, json=body)
        if req.url.path.endswith("/me/assigned_instagram_accounts"):
            return httpx.Response(200, json={"data": ig_accounts})
        if req.url.path.endswith("/me"):
            return httpx.Response(200, json={"client_business_id": "biz1", "id": "77"})
        return httpx.Response(404, json={"error": {"message": "unexpected"}})
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_state_roundtrip_and_tamper():
    s = instagram.make_state(7)
    assert instagram.read_state(s) == 7
    with pytest.raises(instagram.InstagramError):
        instagram.read_state(s[:-1] + ("0" if s[-1] != "0" else "1"))


def test_authorize_url():
    u = urlparse(instagram.authorize_url(3))
    q = parse_qs(u.query)
    assert u.netloc == "www.facebook.com" and u.path == "/dialog/oauth"
    assert q["client_id"] == ["123"] and q["config_id"] == ["cfg9"] and q["response_type"] == ["code"]
    assert q["redirect_uri"] == ["https://reels.example.com/api/instagram/callback"]
    assert instagram.read_state(q["state"][0]) == 3


def test_connect_single_account():
    aid = db.save_account({"name": "Tiere"})
    assert instagram.connect(aid, "abc#_", fake_meta([{"id": "1784", "username": "tiere.daily"}])) == [aid]
    acc = db.get_account(aid)
    assert acc["access_token"] == "suat" and acc["ig_user_id"] == "1784" and acc["ig_username"] == "tiere.daily"
    assert acc["client_business_id"] == "biz1" and acc["token_expires_at"] == ""  # never expires


def test_connect_several_accounts_creates_missing_ones():
    tiere = db.save_account({"name": "Tiere"})
    memes = db.save_account({"name": "Memes", "ig_user_id": "2", "access_token": "old"})
    shared = [{"id": "1", "username": "tiere.daily"}, {"id": "2", "username": "memes"}, {"id": "3", "username": "autos"}]
    touched = instagram.connect(tiere, "abc", fake_meta(shared, expires_in=5184000))
    assert touched[0] == tiere and len(touched) == 3
    assert db.get_account(tiere)["ig_user_id"] == "1"
    assert db.get_account(memes)["access_token"] == "suat"
    new = db.row("SELECT * FROM accounts WHERE ig_user_id = '3'")
    assert new["name"] == "autos" and new["active"] == 0 and new["token_expires_at"]


def test_connect_without_shared_account_fails():
    with pytest.raises(instagram.InstagramError):
        instagram.connect(None, "abc", fake_meta([]))


def test_callback_route(monkeypatch):
    aid = db.save_account({"name": "Tiere"})
    seen = {}
    monkeypatch.setattr(instagram, "connect", lambda a, code: seen.update(a=a, code=code) or [a])
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
    assert r.status_code == 303 and r.headers["location"].startswith("https://www.facebook.com/dialog/oauth?")


def _signed(payload: dict) -> str:
    p = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = base64.urlsafe_b64encode(hmac.new(b"s3cret", p.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return f"{sig}.{p}"


def test_deauthorize_and_deletion():
    aid = db.save_account({"name": "a", "ig_user_id": "1784", "access_token": "t", "client_business_id": "biz1"})
    c = TestClient(app)
    assert c.post("/api/instagram/deauthorize", data={"signed_request": "bad.sig"}).status_code == 400
    assert c.post("/api/instagram/deauthorize", data={"signed_request": _signed({"user_id": "biz1"})}).json() == {"ok": True}
    assert db.get_account(aid)["access_token"] == ""
    r = c.post("/api/instagram/data-deletion", data={"signed_request": _signed({"user_id": "1784"})}).json()
    assert r["confirmation_code"] and r["url"].startswith("https://reels.example.com/")
