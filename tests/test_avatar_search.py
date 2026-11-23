import httpx
from fastapi.testclient import TestClient

from app import db, instagram, reddit
from app.config import settings
from app.main import app

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def ig_client(calls):
    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req.url.host)
        if req.url.host == "graph.facebook.com":
            assert req.url.params["fields"] == "profile_picture_url"
            return httpx.Response(200, json={"profile_picture_url": "https://scontent.cdninstagram.com/p.png?x=1"})
        return httpx.Response(200, content=PNG, headers={"content-type": "image/png"})
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_avatar_cached_and_served(monkeypatch):
    aid = db.save_account({"name": "Tiere", "ig_user_id": "1784", "access_token": "tok"})
    calls: list[str] = []
    assert instagram.refresh_avatar(db.get_account(aid), client=ig_client(calls)) == instagram.avatar_path(aid)
    assert calls == ["graph.facebook.com", "scontent.cdninstagram.com"]
    # fresh cache: no new request
    instagram.refresh_avatar(db.get_account(aid), client=ig_client(calls))
    assert len(calls) == 2
    c = TestClient(app)
    acc = c.get(f"/ui-api/accounts/{aid}").json()["account"]
    assert acc["avatar_url"].startswith(f"/ui-api/accounts/{aid}/avatar?v=")
    r = c.get(acc["avatar_url"])
    assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content == PNG
    # disconnecting removes the picture
    c.post(f"/ui-api/accounts/{aid}/instagram/disconnect")
    assert not instagram.avatar_path(aid).exists()
    assert c.get(f"/ui-api/accounts/{aid}").json()["account"]["avatar_url"] is None


def test_avatar_failure_falls_back(monkeypatch):
    aid = db.save_account({"name": "Ohne", "ig_user_id": "9", "access_token": "tok"})
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(400, json={"error": {"message": "nope"}})
    client = httpx.Client(transport=httpx.MockTransport(handler))
    assert instagram.refresh_avatar(db.get_account(aid), client=client) is None
    # cooldown: no second request right away
    assert instagram.refresh_avatar(db.get_account(aid), client=client) is None
    assert len(calls) == 1
    assert TestClient(app).get(f"/ui-api/accounts/{aid}/avatar").status_code == 404
    instagram.delete_avatar(aid)


def test_account_without_instagram_has_no_avatar():
    aid = db.save_account({"name": "Leer"})
    assert TestClient(app).get(f"/ui-api/accounts/{aid}").json()["account"]["avatar_url"] is None


AUTOCOMPLETE = {"data": {"children": [
    {"kind": "t5", "data": {"display_name": "aww", "title": "A subreddit for cute things", "subscribers": 37000000,
                            "over18": False, "community_icon": "https://styles.redditmedia.com/aww.png?width=256&amp;s=x"}},
    {"kind": "t5", "data": {"display_name": "awwnsfw", "title": "x", "subscribers": 10, "over18": True}},
    {"kind": "t5", "data": {"display_name": "u_awwuser", "subreddit_type": "user"}},
]}}


def test_search_subreddits_public_endpoint(monkeypatch):
    monkeypatch.setattr(settings, "reddit_client_id", "")
    reddit._search_cache.clear()
    seen = []

    def handler(req):
        seen.append(req.url)
        return httpx.Response(200, json=AUTOCOMPLETE)
    res = reddit.search_subreddits("r/aw", client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert seen[0].host == "www.reddit.com" and seen[0].params["query"] == "aw"
    assert [s["name"] for s in res] == ["aww", "awwnsfw"]
    assert res[0]["icon"] == "https://styles.redditmedia.com/aww.png" and res[0]["subscribers"] == 37000000
    # cached
    assert reddit.search_subreddits("aw", client=httpx.Client(transport=httpx.MockTransport(handler))) == res
    assert len(seen) == 1
    sfw = reddit.search_subreddits("aw", include_nsfw=False, client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert [s["name"] for s in sfw] == ["aww"]
    assert reddit.search_subreddits("a") == []


def test_search_route(monkeypatch):
    monkeypatch.setattr(reddit, "search_subreddits", lambda q, include_nsfw=True: [{"name": q}])
    c = TestClient(app)
    assert c.get("/ui-api/reddit/subreddits", params={"q": "cats"}).json() == {"subreddits": [{"name": "cats"}]}

    def boom(q, include_nsfw=True):
        raise reddit.RedditError("HTTP 429")
    monkeypatch.setattr(reddit, "search_subreddits", boom)
    assert c.get("/ui-api/reddit/subreddits", params={"q": "cats"}).status_code == 502
