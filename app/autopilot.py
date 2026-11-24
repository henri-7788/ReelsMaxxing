"""Built-in autopilot: plans render times, renders ahead of each posting slot and posts on time.

"Every X hours" accounts work the other way round: their slot is the start of the run, so the
render block begins at that time and the video is posted as soon as it is ready.

Every account with the workflow switch on is handled here (AUTOMATION=internal, the default).

Planning: every upcoming slot of every account gets one render block of the estimated render
time that must end RENDER_LEAD_MINUTES before the slot. Blocks are placed as late as possible,
walking backwards from the last slot, so they never overlap, across all accounts: the mini PC
encodes one video at a time. Blocks that would have to start in the past are pushed to "now"
one after another; if one then ends after its slot it is marked late and posted as soon as it is
ready (as long as the slot window is still open).

Two worker threads: one renders the plan block by block, one posts ready videos when their slot
comes. Posting runs separately so a long Instagram upload never delays the next render.
"""
import logging
import statistics
import threading
import time
from datetime import datetime, timedelta

from . import db, pipeline, scheduler
from .config import settings
from .scheduler import MAX_ATTEMPTS_PER_SLOT, now_local, parse_slot, slot_key

log = logging.getLogger(__name__)

TICK_SECONDS = 20
RETRY_MINUTES = 10  # wait before trying a slot again whose render found nothing / failed
MAX_RENDER_MINUTES = 60

_lock = threading.Lock()
_running: dict | None = None  # the render job in progress: {"account_id", "slot", "started"}
_attempts: dict[tuple[int, str], tuple[int, float]] = {}  # (account, slot) -> (tries, last try ts)
_last_error: dict[int, dict] = {}  # account -> {"slot", "message", "at"}
_started = False


def enabled() -> bool:
    return settings.automation == "internal"


def render_estimate_seconds() -> int:
    """Time to reserve per render: 1.5 x the median of the last renders, at least RENDER_MINUTES."""
    measured = [r["render_seconds"] for r in db.rows(
        "SELECT render_seconds FROM posts WHERE render_seconds IS NOT NULL ORDER BY id DESC LIMIT 15")]
    base = settings.render_minutes * 60
    if measured:
        base = max(base, statistics.median(measured) * 1.5)
    minutes = min(MAX_RENDER_MINUTES, -(-int(base) // 60))  # round up to whole minutes
    return minutes * 60


def _since(acc: dict):
    raw = acc.get("workflow_since") or ""
    try:
        return datetime.fromisoformat(raw) if raw else None
    except ValueError:
        return None


def plan(now: datetime | None = None, until: datetime | None = None) -> dict:
    """Render plan for all accounts with the workflow on.

    Returns {"renders": [...], "blocked": [...], "render_minutes": n, "lead_minutes": n}. Each render:
    account_id, name, slot ('YYYY-MM-DD HH:MM'), start, end (ISO, local time), state
    ("running" | "planned" | "late").
    """
    now = now_local(now)
    window = timedelta(minutes=settings.slot_window_minutes)
    until = max(until or now, now + timedelta(hours=settings.plan_hours))
    budget = timedelta(seconds=render_estimate_seconds())
    lead = timedelta(minutes=settings.render_lead_minutes)

    with _lock:
        running = dict(_running) if _running else None
    first = slot_key(now - window)
    taken: set[tuple[int, str]] = set()
    failed: dict[tuple[int, str], int] = {}
    for r in db.rows("SELECT account_id, slot, status FROM posts WHERE slot IS NOT NULL AND slot >= ?", (first,)):
        key = (r["account_id"], r["slot"])
        if r["status"] in ("rendering", "ready", "publishing", "published"):
            taken.add(key)
        elif r["status"] == "failed":
            failed[key] = failed.get(key, 0) + 1

    jobs, blocked = [], []
    with_sources = {r["account_id"] for r in db.rows("SELECT DISTINCT account_id FROM sources")}
    for acc in db.list_accounts():
        if not acc["active"]:
            continue
        reason = ("nicht mit Instagram verbunden" if not acc["ig_user_id"] or not acc["access_token"]
                  else "keine Subreddits" if acc["id"] not in with_sources else None)
        if reason:
            blocked.append({"account_id": acc["id"], "name": acc["name"], "reason": reason})
            continue
        since = _since(acc)
        for t in scheduler.slots_between(acc, now - window, until):
            key = (acc["id"], slot_key(t))
            if key in taken or failed.get(key, 0) >= MAX_ATTEMPTS_PER_SLOT:
                continue
            if since and t < since:
                continue  # switched on after this slot: no catch-up
            if running and (running["account_id"], running["slot"]) == key:
                continue
            jobs.append({"account_id": acc["id"], "name": acc["name"], "slot": key[1], "at": t,
                         "kind": "start" if scheduler.starts_workflow(acc) else "post"})

    # 1. Workflow starts ("every X hours"): the run begins at its time, queued behind another one
    #    if two collide. These blocks are fixed first; posting-time renders are fitted around them.
    starts = sorted((j for j in jobs if j["kind"] == "start"), key=lambda j: (j["at"], j["account_id"]))
    cursor = None
    for j in starts:
        begin = j["at"] if cursor is None else max(j["at"], cursor)
        j["start"], j["end"] = begin, begin + budget
        cursor = j["end"]
    reserved = [(j["start"], j["end"]) for j in starts]

    # 2. Posting times: backwards, as late as possible, each block done before its slot,
    #    before the next block and outside the workflow starts
    posts = sorted((j for j in jobs if j["kind"] == "post"), key=lambda j: (j["at"], j["account_id"]), reverse=True)
    limit = None
    for j in posts:
        end = j["at"] - lead
        if limit is not None and end > limit:
            end = limit
        moved = True
        while moved:
            moved = False
            for rs, re_ in reserved:
                if end - budget < re_ and end > rs:
                    end, moved = rs, True
        j["start"], j["end"] = end - budget, end
        limit = j["start"]
    jobs = sorted(jobs, key=lambda j: (j["start"], j["account_id"]), reverse=True)

    # Forwards: nothing starts in the past or while the current render still runs
    cursor = now
    if running:
        cursor = max(cursor, running["started"] + budget)
    jobs.reverse()
    for j in jobs:
        if j["start"] < cursor:
            j["start"], j["end"] = cursor, cursor + budget
        cursor = j["end"]

    renders = []
    if running:
        acc = db.get_account(running["account_id"])
        renders.append({"account_id": running["account_id"], "name": acc["name"] if acc else "",
                        "slot": running["slot"], "start": running["started"].isoformat(timespec="minutes"),
                        "end": max(now, running["started"] + budget).isoformat(timespec="minutes"), "state": "running"})
    for j in jobs:
        renders.append({"account_id": j["account_id"], "name": j["name"], "slot": j["slot"],
                        "start": j["start"].isoformat(timespec="minutes"), "end": j["end"].isoformat(timespec="minutes"),
                        "kind": j["kind"],
                        # When the video goes out: at the slot, or right after rendering for workflow starts
                        "post_at": (j["end"] if j["kind"] == "start" else j["at"]).isoformat(timespec="minutes"),
                        "state": ("late" if j["start"] > j["at"] else "planned") if j["kind"] == "start"
                        else ("late" if j["end"] > j["at"] else "planned")})
    return {"renders": renders, "blocked": blocked, "render_minutes": int(budget.total_seconds() // 60),
            "lead_minutes": settings.render_lead_minutes}


def next_job(now: datetime | None = None) -> dict | None:
    """The planned render that should start now, skipping slots that are cooling down after a failure."""
    now = now_local(now)
    with _lock:
        if _running:
            return None
    for r in plan(now)["renders"]:
        if r["state"] == "running":
            continue
        if datetime.fromisoformat(r["start"]) > now:
            return None  # sorted by start: the rest is later
        tries, last = _attempts.get((r["account_id"], r["slot"]), (0, 0.0))
        if tries >= MAX_ATTEMPTS_PER_SLOT or time.time() - last < RETRY_MINUTES * 60:
            continue
        return r
    return None


def run_job(job: dict, now: datetime | None = None) -> None:
    global _running
    key = (job["account_id"], job["slot"])
    with _lock:
        tries, _ = _attempts.get(key, (0, 0.0))
        _attempts[key] = (tries + 1, time.time())
        _running = {"account_id": job["account_id"], "slot": job["slot"], "started": now_local(now)}
    try:
        log.info("Autopilot: rendere %s für Slot %s", job["name"], job["slot"])
        pipeline.prepare(job["account_id"], job["slot"])
        _last_error.pop(job["account_id"], None)
    except Exception as e:  # nothing found, Reddit down, render error: retried after RETRY_MINUTES
        log.warning("Autopilot: Render für %s (Slot %s) fehlgeschlagen: %s", job["name"], job["slot"], e)
        _last_error[job["account_id"]] = {"slot": job["slot"], "message": str(e)[:300], "at": time.time()}
    finally:
        with _lock:
            _running = None


def due_posts(now: datetime | None = None) -> list[dict]:
    """Rendered videos of accounts with the workflow on whose slot has come (and is not too old)."""
    now = now_local(now)
    window = timedelta(minutes=settings.slot_window_minutes)
    out = []
    for p in db.rows("SELECT p.id, p.slot, p.account_id, a.schedule_mode FROM posts p JOIN accounts a ON a.id = p.account_id"
                     " WHERE p.status = 'ready' AND p.slot IS NOT NULL AND a.active = 1 ORDER BY p.slot, p.id"):
        try:
            at = parse_slot(p["slot"])
        except ValueError:
            continue
        # Workflow starts post as soon as the video is ready; rendering (and a queue) comes on top of the window
        until = at + window + (timedelta(seconds=render_estimate_seconds()) * 2 if p["schedule_mode"] == "interval" else timedelta(0))
        if at <= now < until:
            out.append(p)
    return out


def publish_due(now: datetime | None = None) -> int:
    done = 0
    for p in due_posts(now):
        try:
            post = pipeline.publish(p["id"])
            if post["status"] != "published":
                _last_error[p["account_id"]] = {"slot": p["slot"], "message": post.get("error") or "Posten fehlgeschlagen",
                                                "at": time.time()}
        except pipeline.NotPublishable as e:
            # e.g. not connected: mark it so it is not retried every tick
            db.update_post(p["id"], status="failed", error=str(e))
            _last_error[p["account_id"]] = {"slot": p["slot"], "message": str(e), "at": time.time()}
        except Exception as e:
            log.exception("Autopilot: Posten von %s fehlgeschlagen", p["id"])
            db.update_post(p["id"], status="failed", error=str(e)[:1000])
        done += 1
    return done


def state(account_id: int | None = None) -> dict:
    with _lock:
        running = dict(_running) if _running else None
    if running:
        running["started"] = running["started"].isoformat(timespec="seconds")
    errors = {str(k): v for k, v in _last_error.items() if account_id in (None, k)}
    return {"enabled": enabled(), "running": running, "last_errors": errors}


def _loop(step, name: str) -> None:
    while True:
        try:
            step()
        except Exception:
            log.exception("Autopilot (%s) Fehler", name)
        time.sleep(TICK_SECONDS)


def _render_step() -> None:
    job = next_job()
    if job:
        run_job(job)


def start() -> None:
    global _started
    if _started or not enabled():
        return
    _started = True
    threading.Thread(target=_loop, args=(_render_step, "render"), daemon=True, name="autopilot-render").start()
    threading.Thread(target=_loop, args=(publish_due, "post"), daemon=True, name="autopilot-post").start()
    log.info("Autopilot läuft (Render-Planung %s h im Voraus)", settings.plan_hours)
