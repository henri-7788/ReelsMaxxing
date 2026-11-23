"""In-process change feed for the web UI (Server-Sent Events).

Workers (pipeline, scheduler, n8n callbacks) call `posts_changed()` whenever a post row
changes and `set_progress()` while a render runs. The SSE endpoint in app/main.py polls
this state twice a second and pushes only what changed, so the browser updates the queue
without reloading. Everything lives in memory: one uvicorn worker, one process.
"""
import threading
import time

_lock = threading.Lock()
_version = 0
# post_id -> {"stage": "download" | "waiting" | "render", "percent": float | None, "updated": ts}
_progress: dict[int, dict] = {}


def posts_changed() -> None:
    global _version
    with _lock:
        _version += 1


def version() -> int:
    with _lock:
        return _version


def set_progress(post_id: int, stage: str, percent: float | None = None) -> None:
    with _lock:
        _progress[post_id] = {
            "stage": stage,
            "percent": None if percent is None else round(max(0.0, min(100.0, percent)), 1),
            "updated": time.time(),
        }


def clear_progress(post_id: int) -> None:
    with _lock:
        _progress.pop(post_id, None)


def progress() -> dict[int, dict]:
    with _lock:
        return {k: {"stage": v["stage"], "percent": v["percent"]} for k, v in _progress.items()}
