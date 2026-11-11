"""Configuration from environment variables."""
import os
from dataclasses import dataclass, field
from pathlib import Path


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("DATA_DIR", "/data")))
    # Public base URL under which /media/... is reachable for Instagram (Cloudflare Tunnel)
    public_base_url: str = field(default_factory=lambda: os.getenv("PUBLIC_BASE_URL", "http://localhost:8080").rstrip("/"))
    # Key n8n sends in the X-API-Key header
    api_key: str = field(default_factory=lambda: os.getenv("API_KEY", ""))
    # Optional basic auth for the web UI (in addition to Cloudflare Access)
    ui_user: str = field(default_factory=lambda: os.getenv("UI_USER", ""))
    ui_password: str = field(default_factory=lambda: os.getenv("UI_PASSWORD", ""))
    reddit_client_id: str = field(default_factory=lambda: os.getenv("REDDIT_CLIENT_ID", ""))
    reddit_client_secret: str = field(default_factory=lambda: os.getenv("REDDIT_CLIENT_SECRET", ""))
    reddit_user_agent: str = field(default_factory=lambda: os.getenv("REDDIT_USER_AGENT", "linux:reels-manager:v1.0"))
    # libx264 (software) or vaapi (Intel GPU, needs /dev/dri)
    encoder: str = field(default_factory=lambda: os.getenv("ENCODER", "libx264"))
    x264_preset: str = field(default_factory=lambda: os.getenv("X264_PRESET", "veryfast"))
    font_file: str = field(default_factory=lambda: os.getenv("FONT_FILE", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
    timezone: str = field(default_factory=lambda: os.getenv("TZ", "Europe/Berlin"))
    media_retention_hours: int = field(default_factory=lambda: int(os.getenv("MEDIA_RETENTION_HOURS", "48")))
    # How long after a planned posting time a slot is still considered due
    slot_window_minutes: int = field(default_factory=lambda: int(os.getenv("SLOT_WINDOW_MINUTES", "90")))
    # Folder with the built web UI (Next.js static export). Default: app/web
    web_dir: str = field(default_factory=lambda: os.getenv("WEB_DIR", ""))

    @property
    def db_path(self) -> Path:
        return self.data_dir / "reels.db"

    @property
    def media_dir(self) -> Path:
        return self.data_dir / "media"

    @property
    def work_dir(self) -> Path:
        return self.data_dir / "work"


settings = Settings()
