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
    r = c.post("/ui-api/accounts", json={"name": "Tiere", "posting_times": "10:00", "caption_template": "{title}",
                                         "active": True, "access_token": "secret"})
    assert r.status_code == 200
    acc = r.json()
    aid = acc["id"]
    assert acc["has_token"] is True and "access_token" not in acc
    r = c.post(f"/ui-api/accounts/{aid}/sources", json={"subreddit": "r/aww", "min_score": 100})
    assert r.json()["sources"][0]["subreddit"] == "aww"
    # empty token keeps the stored one
    c.put(f"/ui-api/accounts/{aid}", json={"name": "Tiere 2", "posting_times": "10:00", "caption_template": "{title}"})
    stored = db.get_account(aid)
    assert stored["name"] == "Tiere 2" and stored["access_token"] == "secret"
    ov = c.get("/ui-api/overview").json()
    assert ov["accounts"][0]["name"] == "Tiere 2" and ov["accounts"][0]["sources"][0]["subreddit"] == "aww"
    assert "access_token" not in c.get(f"/ui-api/accounts/{aid}").json()["account"]
    assert c.get("/ui-api/posts").status_code == 200
    bad = c.put(f"/ui-api/accounts/{aid}", json={"name": "x", "posting_times": "99:00", "caption_template": "x"})
    assert bad.status_code == 400 and "99:00" in bad.json()["detail"]
    sid = db.list_sources(aid)[0]["id"]
    assert c.delete(f"/ui-api/sources/{sid}").json() == {"ok": True}
    assert c.delete(f"/ui-api/accounts/{aid}").json() == {"ok": True}
    assert c.get(f"/ui-api/accounts/{aid}").status_code == 404


def test_pages_and_legacy_redirects(tmp_path, monkeypatch):
    from app import main
    web = tmp_path / "web"
    (web / "posts").mkdir(parents=True)
    (web / "index.html").write_text("<h1>home</h1>")
    (web / "posts.html").write_text("<h1>posts</h1>")
    (web / "posts" / "__next._tree.txt").write_text("rsc")
    (web / "404.html").write_text("nf")
    monkeypatch.setattr(main, "WEB_DIR", web)
    c = client()
    assert c.get("/").text == "<h1>home</h1>"
    assert c.head("/posts").status_code == 200
    assert c.get("/posts/__next._tree.txt").text == "rsc"
    assert c.get("/accounts/7", follow_redirects=False).headers["location"] == "/account?id=7"
    assert c.get("/../app/main.py").status_code == 404
    assert c.get("/nope").status_code == 404
    assert c.get("/api/nope").json()["detail"]


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
    assert c.get("/ui-api/overview").status_code == 401
    assert c.get("/ui-api/overview", auth=("henri", "pw")).status_code == 200
    assert c.get("/health").status_code == 200
    assert c.get("/api/due", headers=H).status_code == 200
