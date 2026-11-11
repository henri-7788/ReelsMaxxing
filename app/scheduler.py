"""Decides which account has a posting slot due right now.

n8n asks every ~15 minutes. A slot is due when its time today has passed, it is
not older than SLOT_WINDOW_MINUTES, and no post for it is running/published yet.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from . import db
from .config import settings

MAX_ATTEMPTS_PER_SLOT = 2


def parse_times(raw: str) -> list[tuple[int, int]]:
    out = []
    for part in raw.replace(";", ",").replace(" ", ",").split(","):
        part = part.strip()
        if not part:
            continue
        h, _, m = part.partition(":")
        hh, mm = int(h), int(m or 0)
        if not (0 <= hh < 24 and 0 <= mm < 60):
            raise ValueError(f"Ungültige Uhrzeit: {part}")
        out.append((hh, mm))
    return sorted(set(out))


def slot_key(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M")


def due_slot(account: dict, now: datetime | None = None) -> str | None:
    tz = ZoneInfo(settings.timezone)
    now = now.astimezone(tz) if now else datetime.now(tz)
    window = timedelta(minutes=settings.slot_window_minutes)
    for hh, mm in reversed(parse_times(account["posting_times"])):
        planned = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if planned <= now < planned + window:
            key = slot_key(planned)
            if db.slot_taken(account["id"], key):
                return None
            failed = db.row("SELECT COUNT(*) AS n FROM posts WHERE account_id = ? AND slot = ? AND status = 'failed'",
                            (account["id"], key))["n"]
            return key if failed < MAX_ATTEMPTS_PER_SLOT else None
    return None


def due_accounts(now: datetime | None = None) -> list[dict]:
    out = []
    for acc in db.list_accounts():
        if not acc["active"]:
            continue
        slot = due_slot(acc, now)
        if slot:
            out.append({"account_id": acc["id"], "name": acc["name"], "slot": slot})
    return out


def next_slot(account: dict, now: datetime | None = None) -> str | None:
    """Next planned posting time (today or tomorrow) as 'YYYY-MM-DD HH:MM', for the UI."""
    tz = ZoneInfo(settings.timezone)
    now = now.astimezone(tz) if now else datetime.now(tz)
    try:
        times = parse_times(account["posting_times"])
    except ValueError:
        return None
    for day in (0, 1):
        base = now + timedelta(days=day)
        for hh, mm in times:
            planned = base.replace(hour=hh, minute=mm, second=0, microsecond=0)
            if planned > now:
                return slot_key(planned)
    return None
