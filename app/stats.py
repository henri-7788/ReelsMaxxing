"""Numbers for the dashboard charts, computed from the posts table (no Instagram insights yet)."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from . import db
from .config import settings


def _local(iso: str, tz: ZoneInfo) -> datetime:
    return datetime.fromisoformat(iso).astimezone(tz)


def summary(account_id: int | None = None, days: int = 30, now: datetime | None = None) -> dict:
    tz = ZoneInfo(settings.timezone)
    now = now.astimezone(tz) if now else datetime.now(tz)
    where, params = ("WHERE account_id = ?", (account_id,)) if account_id else ("", ())
    posts = db.rows(f"SELECT account_id, subreddit, status, updated_at FROM posts {where}", params)

    today = now.date()
    daily = {today - timedelta(days=i): {"published": 0, "failed": 0} for i in range(days)}
    heatmap = [[0] * 24 for _ in range(7)]  # [weekday Monday=0][hour], published posts
    week = {"published": 0, "failed": 0}
    prev = {"published": 0, "failed": 0}
    by_status: dict[str, int] = {}
    sources: dict[tuple[int, str], dict] = {}

    for p in posts:
        status = p["status"]
        by_status[status] = by_status.get(status, 0) + 1
        when = _local(p["updated_at"], tz)
        src = sources.setdefault((p["account_id"], p["subreddit"]),
                                 {"account_id": p["account_id"], "subreddit": p["subreddit"], "total": 0,
                                  "published": 0, "failed": 0, "last": None})
        src["total"] += 1
        if src["last"] is None or p["updated_at"] > src["last"]:
            src["last"] = p["updated_at"]
        if status not in ("published", "failed"):
            continue
        src[status] += 1
        if status == "published":
            heatmap[when.weekday()][when.hour] += 1
        age = (today - when.date()).days
        if when.date() in daily:
            daily[when.date()][status] += 1
        if 0 <= age < 7:
            week[status] += 1
        elif 7 <= age < 14:
            prev[status] += 1

    return {
        "days": days,
        "daily": [{"date": d.isoformat(), **v} for d, v in sorted(daily.items())],
        "heatmap": heatmap,
        "week": week,
        "previous_week": prev,
        "by_status": by_status,
        "sources": sorted(sources.values(), key=lambda s: (-s["total"], s["subreddit"])),
    }
