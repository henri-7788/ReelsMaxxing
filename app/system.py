"""Mini-PC load for the web UI: CPU, RAM, disk, temperature. Reads /proc directly (no extra dependency)."""
import os
import shutil
import threading
import time
from collections import deque
from pathlib import Path

from . import db
from .config import settings

STARTED = time.time()
HISTORY_SECONDS = 60
_history: deque = deque(maxlen=24 * 60)  # one sample per minute, 24 h
_lock = threading.Lock()
_last_cpu: tuple[int, int] | None = None
_last_percent = 0.0
_last_n8n_poll: float | None = None


def mark_n8n_poll() -> None:
    global _last_n8n_poll
    _last_n8n_poll = time.time()


def _cpu_times() -> tuple[int, int] | None:
    try:
        parts = [int(x) for x in Path("/proc/stat").read_text().splitlines()[0].split()[1:]]
    except (OSError, ValueError, IndexError):
        return None
    idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
    return idle, sum(parts)


def cpu_percent() -> float:
    """Load since the previous call. First call falls back to the 1-minute load average."""
    global _last_cpu, _last_percent
    with _lock:
        now = _cpu_times()
        if now is None:
            return 0.0
        if _last_cpu is None:
            _last_cpu = now
            try:
                _last_percent = min(100.0, os.getloadavg()[0] / (os.cpu_count() or 1) * 100)
            except OSError:
                _last_percent = 0.0
            return round(_last_percent, 1)
        idle, total = now[0] - _last_cpu[0], now[1] - _last_cpu[1]
        if total >= 50:  # at least ~0.5 s of jiffies, otherwise keep the previous value
            _last_cpu = now
            _last_percent = max(0.0, min(100.0, (1 - idle / total) * 100))
        return round(_last_percent, 1)


def memory() -> dict:
    info = {}
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, _, rest = line.partition(":")
            info[key] = int(rest.split()[0]) * 1024
    except (OSError, ValueError, IndexError):
        return {"total": 0, "used": 0, "percent": 0.0}
    total = info.get("MemTotal", 0)
    used = total - info.get("MemAvailable", info.get("MemFree", 0))
    return {"total": total, "used": used, "percent": round(used / total * 100, 1) if total else 0.0}


def temperature() -> float | None:
    best = None
    for zone in Path("/sys/class/thermal").glob("thermal_zone*/temp"):
        try:
            value = int(zone.read_text().strip()) / 1000
        except (OSError, ValueError):
            continue
        if 0 < value < 150 and (best is None or value > best):
            best = value
    return round(best, 1) if best is not None else None


def disk() -> dict:
    try:
        usage = shutil.disk_usage(settings.media_dir if settings.media_dir.exists() else settings.data_dir)
    except OSError:
        return {"total": 0, "used": 0, "free": 0, "percent": 0.0}
    return {"total": usage.total, "used": usage.used, "free": usage.free,
            "percent": round(usage.used / usage.total * 100, 1) if usage.total else 0.0}


def media_files() -> dict:
    files = list(settings.media_dir.glob("*.mp4")) if settings.media_dir.exists() else []
    size = 0
    for f in files:
        try:
            size += f.stat().st_size
        except OSError:
            pass
    return {"count": len(files), "bytes": size}


def sample() -> dict:
    point = {"t": int(time.time()), "cpu": cpu_percent(), "ram": memory()["percent"]}
    _history.append(point)
    return point


def _sampler() -> None:
    while True:
        try:
            sample()
        except Exception:
            pass
        time.sleep(HISTORY_SECONDS)


def start_sampler() -> None:
    threading.Thread(target=_sampler, daemon=True, name="system-sampler").start()


def render_stats() -> dict:
    """Average render time (created -> ready/published) of the last 20 finished posts, and what is rendering now."""
    done = db.rows("SELECT created_at, updated_at FROM posts WHERE status IN ('ready', 'preview', 'publishing', 'published')"
                   " AND media_file IS NOT NULL ORDER BY id DESC LIMIT 20")
    rendering = db.rows("SELECT p.id, p.title, p.subreddit, p.created_at, a.name AS account_name FROM posts p"
                        " JOIN accounts a ON a.id = p.account_id WHERE p.status = 'rendering' ORDER BY p.id")
    return {"rendering": rendering, "sampled": len(done)}


def snapshot() -> dict:
    return {
        "cpu": cpu_percent(),
        "cores": os.cpu_count() or 1,
        "memory": memory(),
        "disk": disk(),
        "media": media_files(),
        "temperature": temperature(),
        "encoder": settings.encoder,
        "uptime_seconds": int(time.time() - STARTED),
        "last_n8n_poll": int(_last_n8n_poll) if _last_n8n_poll else None,
        "render": render_stats(),
        "history": list(_history),
        "time": int(time.time()),
    }
