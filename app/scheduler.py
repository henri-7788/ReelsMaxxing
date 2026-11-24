"""Slots of an account: fixed daily times or "every X hours".

Fixed times are posting times: the video is rendered ahead and posted at that time.
"Every X hours" slots are workflow starts: at that time the run begins (fetch, render) and the
video is posted as soon as it is ready. The rhythm starts at the interval_anchor: the first time
interval_start comes after the schedule was saved or the workflow was switched on.

A slot is due when its time has passed, it is not older than SLOT_WINDOW_MINUTES, and no post for
it is running/published yet. The built-in autopilot (app/autopilot.py) renders ahead of the slots;
with AUTOMATION=n8n the old way still works: n8n asks /api/due every ~15 minutes.
"""
import bisect
import hashlib
import threading
import math
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from . import db
from .config import settings

MAX_ATTEMPTS_PER_SLOT = 2
MODES = ("times", "interval")
MIN_INTERVAL_HOURS = 0.5
MAX_INTERVAL_HOURS = 168
# "Every X hours" counts from this day at interval_start, so the rhythm keeps going across midnight
INTERVAL_ANCHOR = datetime(2024, 1, 1)


def tz() -> ZoneInfo:
    return ZoneInfo(settings.timezone)


def now_local(now: datetime | None = None) -> datetime:
    return now.astimezone(tz()) if now else datetime.now(tz())


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


def parse_time(raw: str) -> tuple[int, int]:
    times = parse_times(raw or "")
    if len(times) != 1:
        raise ValueError(f"Ungültige Startzeit: {raw}")
    return times[0]


def validate(mode: str, posting_times: str, interval_hours: float, interval_start: str,
             interval_hours_max: float = 0) -> None:
    """Raises ValueError with a message for the UI."""
    if mode not in MODES:
        raise ValueError("Unbekannter Zeitplan")
    parse_times(posting_times)
    if mode == "interval":
        if not (MIN_INTERVAL_HOURS <= interval_hours <= MAX_INTERVAL_HOURS):
            raise ValueError(f"Abstand muss zwischen {MIN_INTERVAL_HOURS:g} und {MAX_INTERVAL_HOURS} Stunden liegen")
        parse_time(interval_start)
        if interval_hours_max and not (interval_hours <= interval_hours_max <= MAX_INTERVAL_HOURS):
            raise ValueError(f"Bereich: „bis“ muss zwischen {interval_hours:g} und {MAX_INTERVAL_HOURS} Stunden liegen")


def random_gap(account_id, after: datetime, lo: float, hi: float) -> timedelta:
    """Gap after the slot `after`, somewhere in [lo, hi] hours, in whole minutes.

    Pseudo-random but fixed: the same account, slot and range always give the same gap. So every
    future posting time is known in advance and the render plan can be made days ahead.
    """
    seed = f"{account_id}|{after:%Y-%m-%d %H:%M}|{lo:g}|{hi:g}".encode()
    frac = int.from_bytes(hashlib.sha256(seed).digest()[:8], "big") / 2**64
    return timedelta(minutes=round((lo + frac * (hi - lo)) * 60))


def starts_workflow(account: dict) -> bool:
    """True: slots are workflow starts (post when rendered). False: slots are posting times."""
    return account.get("schedule_mode") == "interval"


def next_anchor(start: str, now: datetime | None = None) -> str:
    """First time `start` (HH:MM) comes at or after now, as 'YYYY-MM-DD HH:MM' (local)."""
    hh, mm = parse_time(start)
    now = now_local(now).replace(tzinfo=None, second=0, microsecond=0)
    t = now.replace(hour=hh, minute=mm)
    if t < now:
        t += timedelta(days=1)
    return slot_key(t)


def anchor_of(account: dict) -> datetime:
    """Naive local time of the first interval run (old accounts without anchor: a fixed day in 2024)."""
    raw = account.get("interval_anchor") or ""
    try:
        return datetime.strptime(raw, "%Y-%m-%d %H:%M")
    except ValueError:
        hh, mm = parse_time(account.get("interval_start") or "00:00")
        return INTERVAL_ANCHOR.replace(hour=hh, minute=mm)


def slot_key(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M")


def parse_slot(key: str) -> datetime:
    return datetime.strptime(key, "%Y-%m-%d %H:%M").replace(tzinfo=tz())


_chains: dict[tuple, list[datetime]] = {}
_chains_lock = threading.Lock()


def _random_chain(account_id, anchor: datetime, lo: float, hi: float, since: datetime, until: datetime) -> list[datetime]:
    """Run times with random gaps in [since, until) (wall-clock, naive), counted from the anchor.

    Walked once from the anchor and cached, so the plan (checked every few seconds) stays cheap.
    """
    key = (account_id, anchor, lo, hi)
    with _chains_lock:
        chain = _chains.setdefault(key, [anchor])
        while chain[-1] < until:
            chain.append(chain[-1] + random_gap(account_id, chain[-1], lo, hi))
        return chain[bisect.bisect_left(chain, since):bisect.bisect_left(chain, until)]


def slots_between(account: dict, start: datetime, end: datetime) -> list[datetime]:
    """All posting times of the account with start <= t < end (local time, aware), sorted.

    Computed on wall-clock time, so 08:00 stays 08:00 after a daylight saving switch.
    """
    zone = tz()
    a, b = start.astimezone(zone).replace(tzinfo=None), end.astimezone(zone).replace(tzinfo=None)
    out: list[datetime] = []
    try:
        lo = float(account.get("interval_hours") or 0)
        hi = float(account.get("interval_hours_max") or 0)
        if account.get("schedule_mode") == "interval" and hi > lo >= MIN_INTERVAL_HOURS:
            out.extend(_random_chain(account.get("id"), anchor_of(account), lo, hi, a, b))
        elif account.get("schedule_mode") == "interval":
            step = timedelta(hours=lo)
            if step < timedelta(hours=MIN_INTERVAL_HOURS):
                return []
            anchor = anchor_of(account)
            k = max(0, math.ceil((a - anchor) / step))
            t = anchor + k * step
            while t < b:
                if t >= a:
                    out.append(t.replace(second=0, microsecond=0))
                t += step
        else:
            times = parse_times(account.get("posting_times") or "")
            day = a.replace(hour=0, minute=0, second=0, microsecond=0)
            while day < b:
                for hh, mm in times:
                    t = day.replace(hour=hh, minute=mm)
                    if a <= t < b:
                        out.append(t)
                day += timedelta(days=1)
    except ValueError:
        return []
    return [t.replace(tzinfo=zone) for t in sorted(set(out))]


def failed_attempts(account_id: int, key: str) -> int:
    return db.row("SELECT COUNT(*) AS n FROM posts WHERE account_id = ? AND slot = ? AND status = 'failed'",
                  (account_id, key))["n"]


def due_slot(account: dict, now: datetime | None = None) -> str | None:
    now = now_local(now)
    window = timedelta(minutes=settings.slot_window_minutes)
    recent = slots_between(account, now - window + timedelta(seconds=1), now + timedelta(seconds=1))
    if not recent:
        return None
    key = slot_key(recent[-1])
    if db.slot_taken(account["id"], key):
        return None
    return key if failed_attempts(account["id"], key) < MAX_ATTEMPTS_PER_SLOT else None


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
    """Next planned posting time as 'YYYY-MM-DD HH:MM', for the UI."""
    now = now_local(now)
    upcoming = slots_between(account, now + timedelta(seconds=1), now + timedelta(days=8))
    return slot_key(upcoming[0]) if upcoming else None
