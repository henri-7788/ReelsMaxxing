from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import db, pipeline, presets, reddit
from app.main import app


def test_normalize_clamps_and_fills():
    st = presets.normalize({"hook_font_size": "500", "credit_position": "nowhere", "hook_box_opacity": 0.3})
    assert st["hook_font_size"] == 96 and st["credit_position"] == "bottom_left" and st["hook_box_opacity"] == 0.3
    assert presets.normalize(None) == presets.DEFAULTS


def test_presets_are_global():
    c = TestClient(app)
    aid = c.post("/ui-api/accounts", json={"name": "Tiere"}).json()["id"]
    other = c.post("/ui-api/accounts", json={"name": "Autos"}).json()["id"]
    r = c.post("/ui-api/presets", json={"name": "Groß", "settings": {"hook_font_size": 80}}).json()
    pid = r["id"]
    assert r["presets"][0]["settings"]["hook_font_size"] == 80
    assert pipeline.account_style(db.get_account(aid)) == presets.DEFAULTS
    # both accounts can use the same preset
    r = c.put(f"/ui-api/accounts/{aid}/preset", json={"preset_id": pid}).json()
    assert r["account"]["preset_id"] == pid
    c.put(f"/ui-api/accounts/{other}/preset", json={"preset_id": pid})
    assert {u["name"] for u in c.get("/ui-api/presets").json()["presets"][0]["used_by"]} == {"Tiere", "Autos"}
    c.put(f"/ui-api/presets/{pid}", json={"name": "Größer", "settings": {"hook_font_size": 90}})
    assert pipeline.account_style(db.get_account(other))["hook_font_size"] == 90
    assert c.get(f"/ui-api/accounts/{other}").json()["presets"][0]["name"] == "Größer"
    # deleting an account keeps the preset for the others
    c.delete(f"/ui-api/accounts/{aid}")
    assert len(c.get("/ui-api/presets").json()["presets"]) == 1
    assert c.put(f"/ui-api/accounts/{other}/preset", json={"preset_id": 999}).status_code == 404
    assert c.delete(f"/ui-api/presets/{pid}").json()["presets"] == []
    assert db.get_account(other)["preset_id"] is None


def test_old_account_presets_become_global():
    with db.tx() as c:
        c.executescript("""
            DROP TABLE presets;
            CREATE TABLE presets (id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                name TEXT NOT NULL, settings TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            INSERT INTO accounts (name, created_at) VALUES ('Tiere', 'x');
            INSERT INTO presets (account_id, name, settings, created_at, updated_at) VALUES (1, 'Alt', '{}', 'x', 'x');
        """)
    db.init_db()
    db.delete_account(1)
    assert [p["name"] for p in db.list_presets()] == ["Alt"]


def test_text_parts_can_be_switched_off(tmp_path):
    from app import render
    off = render.build_filter(tmp_path / "h.txt", tmp_path / "c.txt", False, {"hook_enabled": False, "credit_enabled": False})
    assert "drawtext" not in off and off.endswith("[base]format=yuv420p[v]")
    only_credit = render.build_filter(tmp_path / "h.txt", tmp_path / "c.txt", False, {"hook_enabled": False})
    assert only_credit.count("drawtext") == 1 and "c.txt" in only_credit
    assert presets.normalize({"credit_enabled": "nein"})["credit_enabled"] is True


MPD = """<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period>
<AdaptationSet contentType="video"><Representation bandwidth="900000"><BaseURL>CMAF_720.mp4</BaseURL></Representation></AdaptationSet>
<AdaptationSet contentType="audio" mimeType="audio/mp4">
<Representation bandwidth="64000"><BaseURL>CMAF_AUDIO_64.mp4</BaseURL></Representation>
<Representation bandwidth="128000"><BaseURL>CMAF_AUDIO_128.mp4</BaseURL></Representation>
</AdaptationSet></Period></MPD>"""


def test_parse_dash_audio_prefers_best_bitrate():
    urls = reddit.parse_dash_audio(MPD, "https://v.redd.it/abc/")
    assert urls == ["https://v.redd.it/abc/CMAF_AUDIO_128.mp4", "https://v.redd.it/abc/CMAF_AUDIO_64.mp4"]
    assert reddit.parse_dash_audio("kaputt", "https://v.redd.it/abc/") == []


def test_resolve_audio(monkeypatch, tmp_path):
    v, a = tmp_path / "v.mp4", tmp_path / "a.mp4"
    monkeypatch.setattr(pipeline.render, "has_audio_stream", lambda p: False)
    # Reddit says: no sound -> muted, no error
    assert pipeline.resolve_audio({"has_audio": False}, v, None) == (None, True)
    # Reddit says it has sound but nothing could be loaded -> error, never a silent post
    with pytest.raises(pipeline.MissingAudio):
        pipeline.resolve_audio({"has_audio": True}, v, None)
    monkeypatch.setattr(pipeline.render, "audio_peak_db", lambda p: -91.0)
    assert pipeline.resolve_audio({"has_audio": True}, v, a) == (None, True)
    monkeypatch.setattr(pipeline.render, "audio_peak_db", lambda p: -3.0)
    assert pipeline.resolve_audio({"has_audio": True}, v, a) == (a, False)


def test_prepare_tries_next_video_when_audio_missing(monkeypatch):
    aid = db.save_account({"name": "Tiere"})
    db.add_source(aid, {"subreddit": "aww"})
    picks = iter([{"id": "a1", "subreddit": "aww", "title": "Eins", "author": "x", "permalink": "/1", "video": {"has_audio": True}},
                  {"id": "a2", "subreddit": "aww", "title": "Zwei", "author": "y", "permalink": "/2", "video": {"has_audio": True}}])
    monkeypatch.setattr(reddit, "pick_candidate", lambda s: next(picks))
    monkeypatch.setattr(reddit, "download", lambda v, d: (Path("v.mp4"), None))
    calls = []

    def fake_resolve(meta, video, audio):
        calls.append(1)
        if len(calls) == 1:
            raise pipeline.MissingAudio("kein Ton")
        return None, True

    monkeypatch.setattr(pipeline, "resolve_audio", fake_resolve)
    monkeypatch.setattr(pipeline.render, "render", lambda *a, **k: None)
    res = pipeline.prepare(aid)
    assert res["muted"] is True
    posts = {p["reddit_id"]: p for p in db.list_posts(10)}
    assert posts["a1"]["status"] == "failed" and posts["a2"]["status"] == "ready" and posts["a2"]["muted"] == 1
