"""Prepare one Reel for an account: pick a Reddit video, download, render, store."""
import logging
import secrets
import shutil
import time
from pathlib import Path

from . import db, events, instagram, presets, reddit, render
from .captions import build_caption, hook_lines
from .config import settings

log = logging.getLogger(__name__)


class NothingFound(RuntimeError):
    pass


class MissingAudio(RuntimeError):
    pass


def account_style(account: dict) -> dict:
    """Overlay style for renders of this account: its active preset or the defaults."""
    preset = db.get_preset(account["preset_id"]) if account.get("preset_id") else None
    if preset:
        return presets.from_json(preset["settings"])
    return dict(presets.DEFAULTS)


def resolve_audio(video_meta: dict, video: Path, audio: Path | None) -> tuple[Path | None, bool]:
    """Pick the audio input and decide whether the source is muted.

    Returns (audio file or None, muted). Raises MissingAudio when Reddit says the video has sound
    but no audio track could be loaded, so the post fails instead of going out silent.
    """
    if audio is None and render.has_audio_stream(video):
        audio = video  # some sources come with audio already muxed into the video file
    if audio is None:
        if video_meta.get("has_audio") is False or video_meta.get("is_gif"):
            return None, True
        raise MissingAudio("Tonspur von Reddit konnte nicht geladen werden (Video hätte Ton)")
    peak = render.audio_peak_db(audio)
    if peak is None:
        if video_meta.get("has_audio") is False:
            return None, True
        raise MissingAudio("Tonspur von Reddit ist beschädigt oder leer")
    if peak < render.SILENCE_DB:
        return None, True  # silent track: render with a clean silent track instead
    return audio, False


MAX_AUDIO_RETRIES = 3


def _build(account: dict, item: dict, slot: str | None) -> tuple[int, str, str, bool]:
    """Download and render one Reddit video. Returns (post id, media file, caption, muted)."""
    post_id = db.create_post(account["id"], item, slot)
    work = settings.work_dir / f"post-{post_id}"
    events.set_progress(post_id, "download")
    try:
        video, audio = reddit.download(item["video"], work)
        audio, muted = resolve_audio(item["video"], video, audio)
        if muted:
            log.info("Post %s: Quelle r/%s/%s ist stumm", post_id, item["subreddit"], item["id"])
        style = account_style(account)
        media_file = f"{post_id}-{secrets.token_urlsafe(12)}.mp4"
        hook = (hook_lines(item["title"], style["hook_chars_per_line"], style["hook_max_lines"])
                if account["hook_enabled"] and style["hook_enabled"] else None)
        credit = f"Video: u/{item['author']} · r/{item['subreddit']}"
        render.render(video, audio, settings.media_dir / media_file, hook, credit, work, style=style,
                      on_progress=lambda stage, pct: events.set_progress(post_id, stage, pct))
        caption = build_caption(account["caption_template"], item, account["hashtags"])
        db.update_post(post_id, status="ready", media_file=media_file, caption=caption, muted=int(muted))
    except Exception as e:
        db.update_post(post_id, status="failed", error=str(e)[:1000])
        raise
    finally:
        events.clear_progress(post_id)
        shutil.rmtree(work, ignore_errors=True)
    return post_id, media_file, caption, muted


def media_url(media_file: str) -> str:
    return f"{settings.public_base_url}/media/{media_file}"


def prepare(account_id: int, slot: str | None = None) -> dict:
    account = db.get_account(account_id)
    if not account:
        raise KeyError(f"Account {account_id} existiert nicht")
    sources = db.list_sources(account_id)
    if not sources:
        raise NothingFound(f"Account '{account['name']}' hat keine Subreddits")

    # A video whose sound cannot be loaded fails and the next candidate is tried
    for attempt in range(1, MAX_AUDIO_RETRIES + 1):
        item = reddit.pick_candidate(sources)
        if not item:
            raise NothingFound(f"Kein passendes neues Video für '{account['name']}' gefunden")
        try:
            post_id, media_file, caption, muted = _build(account, item, slot)
            break
        except MissingAudio:
            if attempt == MAX_AUDIO_RETRIES:
                raise
            log.warning("Ohne Ton übersprungen: r/%s/%s, nehme das nächste Video", item["subreddit"], item["id"])

    return {
        "post_id": post_id,
        "account_id": account_id,
        "ig_user_id": account["ig_user_id"],
        "access_token": account["access_token"],
        # Host + version for the Instagram API with Unified Login (n8n builds its URLs from this)
        "graph_api_base": instagram.graph_api_base(),
        "video_url": media_url(media_file),
        "caption": caption,
        "muted": muted,
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
