from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app import db, scheduler
from app.captions import build_caption, hook_lines
from app.reddit import extract_video, is_candidate

TZ = ZoneInfo("Europe/Berlin")


def make_account(times="09:00, 18:30"):
    return db.save_account({"name": "Tiere", "posting_times": times, "active": 1})


def test_parse_times():
    assert scheduler.parse_times("18:30, 9:00;9:00") == [(9, 0), (18, 30)]
    with pytest.raises(ValueError):
        scheduler.parse_times("25:00")


def test_due_slot_window_and_claim():
    aid = make_account()
    acc = db.get_account(aid)
    assert scheduler.due_slot(acc, datetime(2026, 11, 11, 8, 59, tzinfo=TZ)) is None
    slot = scheduler.due_slot(acc, datetime(2026, 11, 11, 9, 10, tzinfo=TZ))
    assert slot == "2026-11-11 09:00"
    assert scheduler.due_slot(acc, datetime(2026, 11, 11, 11, 0, tzinfo=TZ)) is None  # window over
    item = {"id": "abc", "subreddit": "aww", "title": "t", "author": "u", "permalink": "/r/aww/abc"}
    db.create_post(aid, item, slot)
    assert scheduler.due_slot(acc, datetime(2026, 11, 11, 9, 20, tzinfo=TZ)) is None


def test_failed_slot_retries_limited():
    aid = make_account("09:00")
    acc = db.get_account(aid)
    now = datetime(2026, 11, 11, 9, 5, tzinfo=TZ)
    for i in range(2):
        pid = db.create_post(aid, {"id": f"x{i}", "subreddit": "a", "title": "t", "author": "u", "permalink": "/"}, "2026-11-11 09:00")
        db.update_post(pid, status="failed")
        expected = "2026-11-11 09:00" if i == 0 else None
        assert scheduler.due_slot(acc, now) == expected


def test_inactive_not_due():
    aid = make_account("09:00")
    db.save_account({"active": 0}, aid)
    assert scheduler.due_accounts(datetime(2026, 11, 11, 9, 5, tzinfo=TZ)) == []


def test_caption_and_hook():
    item = {"title": "[OC] My cat learned to open the fridge door all by herself", "author": "bob",
            "subreddit": "aww", "permalink": "/r/aww/comments/1"}
    cap = build_caption("{title}\nby u/{author} r/{subreddit} {unknown}\n{hashtags}", item, "#cats")
    assert "by u/bob r/aww {unknown}" in cap and cap.endswith("#cats")
    hook = hook_lines(item["title"])
    assert "[OC]" not in hook and len(hook.splitlines()) <= 3


def _post(**kw):
    base = {"id": "p1", "score": 1000, "author": "bob", "over_18": False,
            "secure_media": {"reddit_video": {"fallback_url": "https://v.redd.it/x/DASH_720.mp4", "duration": 30}}}
    base.update(kw)
    return base


def test_candidate_filters():
    src = {"min_score": 500, "min_duration": 5, "max_duration": 90, "allow_nsfw": 0}
    assert is_candidate(_post(), src)[0]
    assert not is_candidate(_post(score=10), src)[0]
    assert not is_candidate(_post(over_18=True), src)[0]
    assert not is_candidate(_post(secure_media=None), src)[0]
    long = {"reddit_video": {"fallback_url": "u", "duration": 300}}
    assert not is_candidate(_post(secure_media=long), src)[0]


def test_crosspost_video():
    post = {"secure_media": None, "crosspost_parent_list": [{"secure_media": {"reddit_video": {"fallback_url": "u"}}}]}
    assert extract_video(post)["fallback_url"] == "u"
