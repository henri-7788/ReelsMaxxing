import httpx
from fastapi.testclient import TestClient

from app import db, instagram, pipeline
from app.config import settings
from app.main import app

ITEM = {"id": "abc", "subreddit": "aww", "title": "Katze", "author": "u1", "permalink": "/r/aww/abc"}


def _graph(statuses, calls):
    def handler(req: httpx.Request):
        calls.append((req.method, req.url.path))
        if req.url.path.endswith("/media"):
            return httpx.Response(200, json={"id": "C1"})
        if req.url.path.endswith("/C1"):
            return httpx.Response(200, json={"status_code": statuses.pop(0)})
        if req.url.path.endswith("/media_publish"):
            return httpx.Response(200, json={"id": "M1"})
        return httpx.Response(404, json={"error": {"message": "unbekannt"}})
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_publish_reel_waits_for_processing():
    calls = []
    mid = instagram.publish_reel("IG1", "tok", "https://x/media/a.mp4", "cap",
                                 client=_graph(["IN_PROGRESS", "FINISHED"], calls), sleep=lambda s: None)
    assert mid == "M1"
    assert [m for m, _ in calls] == ["POST", "GET", "GET", "POST"]


def test_publish_reel_error_status():
    try:
        instagram.publish_reel("IG1", "tok", "u", "c", client=_graph(["ERROR"], []), sleep=lambda s: None)
    except instagram.InstagramError as e:
        assert "nicht verarbeiten" in str(e)
    else:
        raise AssertionError("expected InstagramError")


def _account(token="tok"):
    aid = db.save_account({"name": "Tiere", "ig_user_id": "IG1", "access_token": token, "active": 1,
                           "posting_times": "10:00", "caption_template": "{title}", "hashtags": "", "hook_enabled": 1})
    return aid


def _rendered_post(aid, status="preview"):
    n = db.row("SELECT COUNT(*) AS n FROM posts")["n"]
    pid = db.create_post(aid, {**ITEM, "id": f"abc{n}"}, None)
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    (settings.media_dir / f"{pid}.mp4").write_bytes(b"x")
    db.update_post(pid, status=status, media_file=f"{pid}.mp4", caption="Katze")
    return pid


def test_publish_marks_post_and_deletes_file(monkeypatch):
    aid = _account()
    pid = _rendered_post(aid)
    monkeypatch.setattr(instagram, "publish_reel", lambda *a, **k: "M9")
    post = pipeline.publish(pid)
    assert post["status"] == "published" and post["ig_media_id"] == "M9"
    assert not (settings.media_dir / f"{pid}.mp4").exists()


def test_publish_failure_keeps_file(monkeypatch):
    aid = _account()
    pid = _rendered_post(aid)

    def boom(*a, **k):
        raise instagram.InstagramError("Token ungültig")
    monkeypatch.setattr(instagram, "publish_reel", boom)
    post = pipeline.publish(pid)
    assert post["status"] == "failed" and "Token ungültig" in post["error"]
    assert (settings.media_dir / f"{pid}.mp4").exists()
    assert pipeline.latest_unposted(aid)["id"] == pid  # can be retried


def test_run_endpoint_full_and_post(monkeypatch):
    c = TestClient(app)
    aid = _account()
    assert c.post(f"/ui-api/accounts/{aid}/run", json={"mode": "full"}).status_code == 400  # no sources
    assert c.post(f"/ui-api/accounts/{aid}/run", json={"mode": "post"}).status_code == 400  # nothing rendered
    db.add_source(aid, {"subreddit": "aww", "min_score": 0})

    started = []

    class FakeThread:
        def __init__(self, target, args, daemon):
            started.append(args)
            self.target, self.args = target, args

        def start(self):
            self.target(*self.args)

    monkeypatch.setattr("app.main.threading.Thread", FakeThread)
    pid = _rendered_post(aid)
    monkeypatch.setattr(pipeline, "prepare", lambda account_id, slot=None: {"post_id": pid})
    monkeypatch.setattr(instagram, "publish_reel", lambda *a, **k: "M1")
    r = c.post(f"/ui-api/accounts/{aid}/run", json={"mode": "full"})
    assert r.json()["started"] is True and started[-1] == (aid, "full", None)
    assert db.get_post(pid)["status"] == "published"
    state = c.get(f"/ui-api/accounts/{aid}/run").json()
    assert state["running"] is False and state["last"]["ok"] is True and state["postable"] is None

    pid2 = _rendered_post(aid)
    assert c.get(f"/ui-api/accounts/{aid}/run").json()["postable"]["id"] == pid2
    r = c.post(f"/ui-api/accounts/{aid}/run", json={"mode": "post"})
    assert r.json()["post_id"] == pid2 and db.get_post(pid2)["status"] == "published"


def test_run_rejects_unconnected_and_double_start():
    c = TestClient(app)
    aid = _account(token="")
    assert c.post(f"/ui-api/accounts/{aid}/run", json={"mode": "full"}).status_code == 400
    aid2 = _account()
    db.add_source(aid2, {"subreddit": "aww", "min_score": 0})
    assert pipeline.claim_run(aid2)
    try:
        assert c.post(f"/ui-api/accounts/{aid2}/run", json={"mode": "full"}).status_code == 409
    finally:
        pipeline._running.discard(aid2)


def test_publish_reel_falls_back_to_direct_upload(tmp_path):
    """Error 2207077: Meta refuses the link. The file is then uploaded directly (resumable upload)."""
    video = tmp_path / "a.mp4"
    video.write_bytes(b"x" * 1234)
    calls = []

    def handler(req: httpx.Request):
        calls.append((req.method, req.url.host, req.url.path))
        if req.url.path.endswith("/media"):
            body = req.content.decode()
            if "upload_type=resumable" in body:
                return httpx.Response(200, json={"id": "C2", "uri": "https://rupload.facebook.com/ig-api-upload/v27.0/C2"})
            return httpx.Response(200, json={"id": "C1"})
        if req.url.host == "rupload.facebook.com":
            assert req.headers["Authorization"] == "OAuth tok"
            assert req.headers["file_size"] == "1234" and req.headers["offset"] == "0"
            return httpx.Response(200, json={"success": True})
        if req.url.path.endswith("/C1"):
            return httpx.Response(200, json={"status_code": "ERROR", "status": "Error: Media upload has failed with error code 2207077"})
        if req.url.path.endswith("/C2"):
            return httpx.Response(200, json={"status_code": "FINISHED"})
        if req.url.path.endswith("/media_publish"):
            assert "creation_id=C2" in req.content.decode()
            return httpx.Response(200, json={"id": "M2"})
        return httpx.Response(404, json={"error": {"message": "unbekannt"}})

    mid = instagram.publish_reel("IG1", "tok", "https://x/media/a.mp4", "cap", video_path=video,
                                 client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None)
    assert mid == "M2"
    assert any(h == "rupload.facebook.com" for _, h, _ in calls)


def test_publish_reel_upload_mode(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "instagram_upload", "upload")
    video = tmp_path / "a.mp4"
    video.write_bytes(b"abc")
    seen = []

    def handler(req: httpx.Request):
        seen.append(req.url.host)
        if req.url.path.endswith("/media"):
            assert "video_url" not in req.content.decode()
            return httpx.Response(200, json={"id": "C3"})  # no uri: built from the container id
        if req.url.host == "rupload.facebook.com":
            assert req.url.path.endswith("/C3")
            return httpx.Response(200, json={"success": True})
        if req.url.path.endswith("/C3"):
            return httpx.Response(200, json={"status_code": "FINISHED"})
        return httpx.Response(200, json={"id": "M3"})

    assert instagram.publish_reel("IG1", "tok", "u", "c", video_path=video,
                                  client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None) == "M3"
    assert "rupload.facebook.com" in seen
