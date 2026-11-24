from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app import autopilot, db, pipeline, scheduler
from app.config import settings

TZ = ZoneInfo("Europe/Berlin")
NOW = datetime(2026, 11, 24, 6, 0, tzinfo=TZ)


@pytest.fixture(autouse=True)
def plan_settings(monkeypatch):
    monkeypatch.setattr(settings, "automation", "internal")
    monkeypatch.setattr(settings, "render_minutes", 10)
    monkeypatch.setattr(settings, "render_lead_minutes", 15)
    monkeypatch.setattr(settings, "plan_hours", 24)
    autopilot._attempts.clear()
    autopilot._last_error.clear()
    autopilot._running = None


def account(name="A", **kw):
    data = {"name": name, "ig_user_id": "1", "access_token": "t", "posting_times": "18:00", **kw}
    aid = db.save_account(data)
    db.add_source(aid, {"subreddit": "aww"})
    db.execute("UPDATE accounts SET active = 1, workflow_since = '' WHERE id = ?", (aid,))
    return aid


def test_interval_slots_continue_across_midnight():
    acc = {"schedule_mode": "interval", "interval_hours": 5, "interval_start": "08:00"}
    got = [scheduler.slot_key(t) for t in scheduler.slots_between(acc, datetime(2026, 11, 24, 0, 0, tzinfo=TZ),
                                                                  datetime(2026, 11, 25, 12, 0, tzinfo=TZ))]
    # Every 5 h from 2024-01-01 08:00 keeps its rhythm instead of restarting each day
    assert all((datetime.strptime(b, "%Y-%m-%d %H:%M") - datetime.strptime(a, "%Y-%m-%d %H:%M")) == timedelta(hours=5)
               for a, b in zip(got, got[1:]))
    assert len(got) == 7  # 36 h / 5 h


def test_interval_every_6h_from_start():
    acc = {"schedule_mode": "interval", "interval_hours": 6, "interval_start": "08:00"}
    got = [scheduler.slot_key(t)[11:] for t in scheduler.slots_between(acc, datetime(2026, 11, 24, 0, 0, tzinfo=TZ),
                                                                       datetime(2026, 11, 25, 0, 0, tzinfo=TZ))]
    assert got == ["02:00", "08:00", "14:00", "20:00"]
    assert scheduler.next_slot(acc, datetime(2026, 11, 24, 14, 0, tzinfo=TZ)) == "2026-11-24 20:00"


def test_validate_interval():
    scheduler.validate("interval", "", 2, "07:30")
    with pytest.raises(ValueError):
        scheduler.validate("interval", "", 0.1, "07:30")
    with pytest.raises(ValueError):
        scheduler.validate("interval", "", 3, "nope")


def _blocks(plan):
    return [(datetime.fromisoformat(r["start"]), datetime.fromisoformat(r["end"]), r) for r in plan["renders"]]


def test_plan_never_overlaps_across_accounts():
    account("A", posting_times="18:00, 18:05, 12:00")
    account("B", posting_times="18:00")
    account("C", schedule_mode="interval", interval_hours=1, interval_start="17:00")
    plan = autopilot.plan(NOW)
    blocks = sorted(_blocks(plan))
    assert blocks
    for (s1, e1, _), (s2, e2, _) in zip(blocks, blocks[1:]):
        assert e1 <= s2, "Render-Blöcke überlappen"
    for s, e, r in blocks:
        assert e - s == timedelta(minutes=10)
        assert s >= NOW
        if r["kind"] == "start":  # "every X hours": the run begins at its time, never before
            assert s >= scheduler.parse_slot(r["slot"])
            assert r["post_at"] == r["end"]
        elif r["slot"] > "2026-11-24 06:25":  # enough time ahead: done 15 min before the slot
            assert e <= scheduler.parse_slot(r["slot"]) - timedelta(minutes=15)
            assert r["state"] == "planned"
    assert len(blocks) == len({(r["account_id"], r["slot"]) for *_, r in blocks})


def test_plan_pushes_past_blocks_to_now_and_marks_late():
    account("A", posting_times="06:10")
    account("B", posting_times="06:10")
    plan = autopilot.plan(NOW)
    first, second = plan["renders"][:2]
    assert datetime.fromisoformat(first["start"]) == NOW
    assert first["end"] == second["start"]
    assert second["state"] == "late"  # only one encode at a time: the second one misses 06:10


def test_plan_skips_taken_switched_on_later_and_unconnected():
    a = account("A", posting_times="05:50, 18:00")
    db.create_post(a, {"id": "x", "subreddit": "aww", "title": "t", "author": "u", "permalink": "/"}, "2026-11-24 18:00")
    b = account("B", posting_times="05:55")
    db.execute("UPDATE accounts SET workflow_since = ? WHERE id = ?", ("2026-11-24T05:58:00+01:00", b))
    c = db.save_account({"name": "C", "posting_times": "19:00", "active": 1})
    plan = autopilot.plan(NOW)
    slots = {(r["account_id"], r["slot"]) for r in plan["renders"]}
    assert (a, "2026-11-24 05:50") in slots  # still inside the slot window: rendered late
    assert (a, "2026-11-24 18:00") not in slots
    assert not any(acc == b for acc, _ in slots if _ < "2026-11-25")
    assert plan["blocked"][0]["account_id"] == c


def test_paused_account_not_planned():
    a = account("A")
    db.set_workflow(a, False)
    assert autopilot.plan(NOW)["renders"] == []
    db.set_workflow(a, True)
    assert db.get_account(a)["workflow_since"]


def test_next_job_and_run(monkeypatch):
    a = account("A", posting_times="06:20")
    calls = []
    monkeypatch.setattr(pipeline, "prepare", lambda aid, slot: calls.append((aid, slot)) or {"post_id": 1})
    job = autopilot.next_job(NOW)
    assert job and job["slot"] == "2026-11-24 06:20"
    autopilot.run_job(job, NOW)
    assert calls == [(a, "2026-11-24 06:20")]
    # Tried just now: no second attempt before the retry pause
    assert autopilot.next_job(NOW) is None


def test_failed_render_is_retried_later(monkeypatch):
    account("A", posting_times="06:20")

    def boom(*_):
        raise pipeline.NothingFound("nichts")
    monkeypatch.setattr(pipeline, "prepare", boom)
    autopilot.run_job(autopilot.next_job(NOW), NOW)
    assert autopilot.state()["last_errors"]
    key = next(iter(autopilot._attempts))
    autopilot._attempts[key] = (1, 0.0)
    assert autopilot.next_job(NOW) is not None


def test_publish_due(monkeypatch):
    a = account("A", posting_times="06:00")
    pid = db.create_post(a, {"id": "x", "subreddit": "aww", "title": "t", "author": "u", "permalink": "/"}, "2026-11-24 06:00")
    db.update_post(pid, status="ready", media_file="x.mp4")
    early = db.create_post(a, {"id": "y", "subreddit": "aww", "title": "t", "author": "u", "permalink": "/"}, "2026-11-24 09:00")
    db.update_post(early, status="ready", media_file="y.mp4")
    published = []
    monkeypatch.setattr(pipeline, "publish", lambda post_id: published.append(post_id) or {"status": "published"})
    assert autopilot.publish_due(NOW + timedelta(minutes=1)) == 1
    assert published == [pid]
    assert autopilot.publish_due(NOW + timedelta(hours=2)) == 0  # window of 06:00 is over; 09:00 not yet


def test_api_interval_workflow_and_plan():
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    body = {"name": "X", "active": False, "posting_times": "", "schedule_mode": "interval",
            "interval_hours": 3, "interval_start": "7:5"}
    acc = c.post("/ui-api/accounts", json=body).json()
    assert acc["schedule_mode"] == "interval" and acc["interval_start"] == "07:05" and acc["active"] is False
    assert c.post("/ui-api/accounts", json={**body, "interval_hours": 0}).status_code == 400
    acc = c.put(f"/ui-api/accounts/{acc['id']}/workflow", json={"on": True}).json()
    assert acc["active"] is True and acc["next_slot"]
    plan = c.get("/ui-api/plan", params={"days": 3}).json()
    # The rhythm starts the next time 07:05 comes, not somewhere in an old rhythm
    assert plan["slots"][0]["slot"] == scheduler.next_anchor("07:05")
    assert len(plan["slots"]) >= 8
    assert plan["blocked"][0]["reason"] == "nicht mit Instagram verbunden"
    # The built-in autopilot posts: n8n gets nothing to do
    assert c.get("/api/due", headers={"X-API-Key": "test-key"}).json() == {"due": []}


def test_random_interval_gaps_in_range_and_fixed_ahead():
    acc = {"id": 7, "schedule_mode": "interval", "interval_hours": 6, "interval_hours_max": 8, "interval_start": "08:00"}
    start, end = datetime(2026, 11, 24, 0, 0, tzinfo=TZ), datetime(2026, 12, 4, 0, 0, tzinfo=TZ)
    got = scheduler.slots_between(acc, start, end)
    gaps = {b - a for a, b in zip(got, got[1:])}
    assert all(timedelta(hours=6) <= g <= timedelta(hours=8) for g in gaps)
    assert len(gaps) > 3  # really random, not a fixed step
    # Same answer every time (so renders can be planned days ahead), also for a window in the middle
    assert scheduler.slots_between(acc, start, end) == got
    mid = scheduler.slots_between(acc, datetime(2026, 11, 28, 0, 0, tzinfo=TZ), end)
    assert mid == [t for t in got if t >= datetime(2026, 11, 28, 0, 0, tzinfo=TZ)]
    # Other accounts get other times
    assert scheduler.slots_between({**acc, "id": 8}, start, end) != got


def test_validate_random_range():
    scheduler.validate("interval", "", 6, "08:00", 8)
    with pytest.raises(ValueError):
        scheduler.validate("interval", "", 6, "08:00", 5)


def test_plan_random_interval_planned_days_ahead():
    account("R", schedule_mode="interval", interval_hours=6, interval_hours_max=8, interval_start="08:00")
    plan = autopilot.plan(NOW)
    slots = [r["slot"] for r in plan["renders"]]
    assert len(slots) >= 3 and slots[-1] > "2026-11-25"  # 24 h ahead already fixed
    assert all(r["state"] in ("planned", "late") for r in plan["renders"])


def test_interval_slot_is_workflow_start_and_posts_when_ready(monkeypatch):
    a = account("W", schedule_mode="interval", interval_hours=6, interval_start="07:00")
    db.execute("UPDATE accounts SET interval_anchor = '2026-11-24 07:00' WHERE id = ?", (a,))
    b = account("P", posting_times="07:20")  # fixed time: must render before 07:05, around W's run
    plan = autopilot.plan(NOW)
    w = next(r for r in plan["renders"] if r["account_id"] == a)
    p = next(r for r in plan["renders"] if r["account_id"] == b)
    assert w["slot"] == "2026-11-24 07:00" and w["start"].startswith("2026-11-24T07:00")
    assert w["post_at"] == w["end"]
    # P's render does not overlap W's run starting at 07:00
    assert p["end"] <= w["start"] or p["start"] >= w["end"]
    assert p["end"] <= "2026-11-24T07:05"
    # Nothing is started before 07:00 for W
    assert autopilot.next_job(datetime(2026, 11, 24, 6, 59, tzinfo=TZ))["account_id"] != a
    # Ready after its start: posted right away
    pid = db.create_post(a, {"id": "z", "subreddit": "aww", "title": "t", "author": "u", "permalink": "/"}, "2026-11-24 07:00")
    db.update_post(pid, status="ready", media_file="z.mp4")
    published = []
    monkeypatch.setattr(pipeline, "publish", lambda post_id: published.append(post_id) or {"status": "published"})
    autopilot.publish_due(datetime(2026, 11, 24, 7, 11, tzinfo=TZ))
    assert published == [pid]


def test_next_anchor():
    now = datetime(2026, 11, 24, 9, 30, tzinfo=TZ)
    assert scheduler.next_anchor("10:00", now) == "2026-11-24 10:00"
    assert scheduler.next_anchor("08:00", now) == "2026-11-25 08:00"
    acc = {"id": 1, "schedule_mode": "interval", "interval_hours": 6, "interval_start": "08:00", "interval_anchor": "2026-11-25 08:00"}
    got = [scheduler.slot_key(t) for t in scheduler.slots_between(acc, now, now + timedelta(days=2))]
    assert got[:3] == ["2026-11-25 08:00", "2026-11-25 14:00", "2026-11-25 20:00"]
