"""Reddit API access (app-only OAuth) and video download."""
import time
from pathlib import Path

import httpx

from . import db
from .config import settings

_token: dict = {"value": None, "expires": 0.0}


class RedditError(RuntimeError):
    pass


def _headers() -> dict:
    return {"User-Agent": settings.reddit_user_agent}


def get_token(client: httpx.Client) -> str:
    if _token["value"] and _token["expires"] > time.time() + 60:
        return _token["value"]
    if not settings.reddit_client_id:
        raise RedditError("REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET sind nicht gesetzt")
    r = client.post(
        "https://www.reddit.com/api/v1/access_token",
        data={"grant_type": "client_credentials"},
        auth=(settings.reddit_client_id, settings.reddit_client_secret),
        headers=_headers(),
    )
    if r.status_code != 200:
        raise RedditError(f"Reddit-Login fehlgeschlagen: HTTP {r.status_code} {r.text[:200]}")
    data = r.json()
    _token["value"] = data["access_token"]
    _token["expires"] = time.time() + int(data.get("expires_in", 3600))
    return _token["value"]


def fetch_listing(client: httpx.Client, source: dict, limit: int = 75) -> list[dict]:
    token = get_token(client)
    sub = source["subreddit"].removeprefix("r/").strip("/ ")
    sort = source.get("sort") or "top"
    params = {"limit": limit, "raw_json": 1}
    if sort == "top":
        params["t"] = source.get("time_filter") or "day"
    r = client.get(f"https://oauth.reddit.com/r/{sub}/{sort}", params=params,
                   headers={**_headers(), "Authorization": f"bearer {token}"})
    if r.status_code != 200:
        raise RedditError(f"r/{sub}: HTTP {r.status_code}")
    return [c["data"] for c in r.json().get("data", {}).get("children", [])]


def extract_video(post: dict) -> dict | None:
    """Return the reddit_video dict of a post (also for crossposts) or None."""
    candidates = [post] + list(post.get("crosspost_parent_list") or [])
    for p in candidates:
        media = p.get("secure_media") or p.get("media") or {}
        rv = media.get("reddit_video") if isinstance(media, dict) else None
        if rv and rv.get("fallback_url"):
            return rv
    return None


def is_candidate(post: dict, source: dict) -> tuple[bool, str]:
    if post.get("stickied") or post.get("removed_by_category") or post.get("locked"):
        return False, "gesperrt/angepinnt"
    if post.get("over_18") and not source.get("allow_nsfw"):
        return False, "nsfw"
    if int(post.get("score", 0)) < int(source.get("min_score", 0)):
        return False, "zu wenig Upvotes"
    rv = extract_video(post)
    if not rv:
        return False, "kein Reddit-Video"
    duration = int(rv.get("duration") or 0)
    if duration < int(source.get("min_duration", 0)) or duration > int(source.get("max_duration", 90)):
        return False, "Länge passt nicht"
    if post.get("author") in (None, "[deleted]"):
        return False, "Autor gelöscht"
    return True, ""


def pick_candidate(sources: list[dict]) -> dict | None:
    """Best unused video across the account's sources (highest score first)."""
    found: list[tuple[int, dict]] = []
    errors = []
    with httpx.Client(timeout=30, follow_redirects=True) as client:
        for src in sources:
            try:
                listing = fetch_listing(client, src)
            except RedditError as e:
                errors.append(str(e))
                continue
            for post in listing:
                ok, _ = is_candidate(post, src)
                if ok and not db.reddit_id_known(post["id"]):
                    found.append((int(post.get("score", 0)), post))
    if not found and errors and len(errors) == len(sources):
        raise RedditError("; ".join(errors))
    if not found:
        return None
    _, post = max(found, key=lambda x: x[0])
    return {
        "id": post["id"],
        "subreddit": post["subreddit"],
        "title": post.get("title", ""),
        "author": post.get("author", ""),
        "permalink": post.get("permalink", ""),
        "video": extract_video(post),
    }


def _audio_urls(fallback_url: str) -> list[str]:
    base = fallback_url.split("?")[0].rsplit("/", 1)[0]
    return [f"{base}/{name}" for name in
            ("DASH_AUDIO_128.mp4", "DASH_AUDIO_64.mp4", "DASH_audio.mp4", "audio")]


def download(video: dict, target_dir: Path) -> tuple[Path, Path | None]:
    target_dir.mkdir(parents=True, exist_ok=True)
    vpath, apath = target_dir / "video.mp4", target_dir / "audio.mp4"
    with httpx.Client(timeout=120, follow_redirects=True, headers=_headers()) as client:
        _stream(client, video["fallback_url"], vpath)
        if video.get("is_gif"):
            return vpath, None
        for url in _audio_urls(video["fallback_url"]):
            try:
                _stream(client, url, apath)
                if apath.stat().st_size > 1024:
                    return vpath, apath
            except httpx.HTTPError:
                continue
    return vpath, None


def _stream(client: httpx.Client, url: str, path: Path) -> None:
    with client.stream("GET", url) as r:
        r.raise_for_status()
        with open(path, "wb") as f:
            for chunk in r.iter_bytes(1 << 16):
                f.write(chunk)
