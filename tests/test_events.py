from app import db, events


def _item(rid="abc"):
    return {"id": rid, "subreddit": "s", "title": "t", "author": "a", "permalink": "/r/s/abc"}


def test_post_changes_bump_version():
    acc = db.save_account({"name": "A"})
    v0 = events.version()
    pid = db.create_post(acc, _item(), None)
    v1 = events.version()
    db.update_post(pid, status="ready")
    assert v0 < v1 < events.version()


def test_progress_is_clamped_and_cleared():
    events.set_progress(7, "render", 140)
    assert events.progress()[7] == {"stage": "render", "percent": 100.0}
    events.set_progress(7, "waiting")
    assert events.progress()[7]["percent"] is None
    events.clear_progress(7)
    assert 7 not in events.progress()
