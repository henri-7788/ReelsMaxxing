"""Prepare one Reel for an account: pick a Reddit video, download, render, store."""
import logging
import secrets
import shutil
import time

from . import db, instagram, reddit, render
from .captions import build_caption, hook_lines
from .config import settings

log = logging.getLogger(__name__)


class NothingFound(RuntimeError):
    pass


def media_url(media_file: str) -> str:
    return f"{settings.public_base_url}/media/{media_file}"


def prepare(account_id: int, slot: str | None = None) -> dict:
    account = db.get_account(account_id)
    if not account:
        raise KeyError(f"Account {account_id} existiert nicht")
    sources = db.list_sources(account_id)
    if not sources:
        raise NothingFound(f"Account '{account['name']}' hat keine Subreddits")

    item = reddit.pick_candidate(sources)
    if not item:
        raise NothingFound(f"Kein passendes neues Video für '{account['name']}' gefunden")

    post_id = db.create_post(account_id, item, slot)
    work = settings.work_dir / f"post-{post_id}"
    try:
        video, audio = reddit.download(item["video"], work)
        media_file = f"{post_id}-{secrets.token_urlsafe(12)}.mp4"
        hook = hook_lines(item["title"]) if account["hook_enabled"] else None
        credit = f"Video: u/{item['author']}  ·  r/{item['subreddit']}"
        render.render(video, audio, settings.media_dir / media_file, hook, credit, work)
        caption = build_caption(account["caption_template"], item, account["hashtags"])
        db.update_post(post_id, status="ready", media_file=media_file, caption=caption)
    except Exception as e:
        db.update_post(post_id, status="failed", error=str(e)[:1000])
        raise
    finally:
        shutil.rmtree(work, ignore_errors=True)

    return {
        "post_id": post_id,
        "account_id": account_id,
        "ig_user_id": account["ig_user_id"],
        "access_token": account["access_token"],
        # Host + version for the Instagram API with Unified Login (n8n builds its URLs from this)
        "graph_api_base": instagram.graph_api_base(),
        "video_url": media_url(media_file),
        "caption": caption,
        "reddit_url": "https://reddit.com" + item["permalink"],
    }


def report_result(post_id: int, status: str, ig_media_id: str | None = None, error: str | None = None) -> dict:
    post = db.get_post(post_id)
    if not post:
        raise KeyError(f"Post {post_id} existiert nicht")
    if status not in {"publishing", "published", "failed"}:
        raise ValueError("status muss publishing, published oder failed sein")
    fields = {"status": status}
    if ig_media_id:
        fields["ig_media_id"] = ig_media_id
    if error:
        fields["error"] = error[:1000]
    db.update_post(post_id, **fields)
    if status == "published" and post["media_file"]:
        (settings.media_dir / post["media_file"]).unlink(missing_ok=True)
    return db.get_post(post_id)


def cleanup_media() -> int:
    """Delete rendered files older than MEDIA_RETENTION_HOURS."""
    cutoff = time.time() - settings.media_retention_hours * 3600
    removed = 0
    for f in settings.media_dir.glob("*.mp4"):
        if f.stat().st_mtime < cutoff:
            f.unlink(missing_ok=True)
            removed += 1
    return removed
