from fastapi.testclient import TestClient

from app import db, pipeline
from app.main import app

H = {"X-API-Key": "test-key"}


def client():
    return TestClient(app)


def test_api_key_required():
    c = client()
    assert c.get("/api/due").status_code == 401
    assert c.get("/api/due", headers=H).json() == {"due": []}


def test_ui_account_and_source_flow():
    c = client()
    r = c.post("/accounts/save", data={"name": "Tiere", "posting_times": "10:00", "caption_template": "{title}",
                                      "active": "1", "access_token": "secret"}, follow_redirects=False)
    assert r.status_code == 303
    aid = int(r.headers["location"].rsplit("/", 1)[1])
    c.post(f"/accounts/{aid}/sources", data={"subreddit": "r/aww", "min_score": "100"})
    assert db.list_sources(aid)[0]["subreddit"] == "aww"
    # empty token keeps the stored one
    c.post("/accounts/save", data={"account_id": str(aid), "name": "Tiere 2", "posting_times": "10:00",
                                   "caption_template": "{title}"})
    acc = db.get_account(aid)
    assert acc["name"] == "Tiere 2" and acc["access_token"] == "secret"
    assert "Tiere 2" in c.get("/").text
    assert c.get(f"/accounts/{aid}").status_code == 200
    assert c.get("/accounts/new").status_code == 200
    assert c.get("/posts").status_code == 200
    bad = c.post("/accounts/save", data={"account_id": str(aid), "name": "x", "posting_times": "99:00", "caption_template": "x"})
    assert bad.status_code == 400


def test_prepare_skips_without_sources():
    aid = db.save_account({"name": "Leer"})
    r = client().post(f"/api/accounts/{aid}/prepare", headers=H, json={})
    assert r.status_code == 200 and r.json()["skipped"] is True


def test_result_publishes_and_deletes_media(tmp_data):
    aid = db.save_account({"name": "A"})
    pid = db.create_post(aid, {"id": "r1", "subreddit": "a", "title": "t", "author": "u", "permalink": "/"}, None)
    f = tmp_data / "media" / "1-abc.mp4"
    f.write_bytes(b"x")
    db.update_post(pid, status="ready", media_file=f.name)
    c = client()
    assert c.get(f"/media/{f.name}").status_code == 200
    assert c.get("/media/../reels.db").status_code == 404
    r = c.post(f"/api/posts/{pid}/result", headers=H, json={"status": "published", "ig_media_id": "999"})
    assert r.json()["status"] == "published" and not f.exists()
    assert c.post(f"/api/posts/{pid}/result", headers=H, json={"status": "nope"}).status_code == 400


def test_basic_auth(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "ui_user", "henri")
    monkeypatch.setattr(settings, "ui_password", "pw")
    c = client()
    assert c.get("/").status_code == 401
    assert c.get("/", auth=("henri", "pw")).status_code == 200
    assert c.get("/health").status_code == 200
