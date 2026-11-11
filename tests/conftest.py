import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def tmp_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "api_key", "test-key")
    monkeypatch.setattr(settings, "ui_user", "")
    monkeypatch.setattr(settings, "timezone", "Europe/Berlin")
    from app import db
    db.init_db()
    yield tmp_path
