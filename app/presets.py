"""Overlay styles for the renderer ("presets"), saved per account.

All coordinates are in the 1080x1920 output frame. The web editor (web/lib/overlay.ts) mirrors
these values and the credit positions so its live preview matches the render.
"""
import json

# Instagram covers roughly the top 220 px and the bottom ~450 px with its UI, the action buttons
# sit on the right edge. Credit positions stay inside that safe area, close to the frame edge.
EDGE = 54
TOP_Y = 240
BOTTOM_GAP = 480

CREDIT_POSITIONS: dict[str, tuple[str, str]] = {
    "bottom_left": (f"{EDGE}", f"h-text_h-{BOTTOM_GAP}"),
    "bottom_center": ("(w-text_w)/2", f"h-text_h-{BOTTOM_GAP}"),
    "top_left": (f"{EDGE}", f"{TOP_Y}"),
    "top_right": (f"w-text_w-{EDGE}", f"{TOP_Y}"),
}

DEFAULTS: dict = {
    "hook_enabled": True,     # post title at the top
    "credit_enabled": True,   # "Video: u/... · r/..." line
    "hook_font_size": 62,
    "hook_top": 250,
    "hook_max_lines": 3,
    "hook_chars_per_line": 24,
    "hook_box_opacity": 0.55,
    "credit_position": "bottom_left",
    "credit_font_size": 30,
    "credit_box_opacity": 0.4,
}

# (min, max) per numeric field
LIMITS: dict[str, tuple[float, float]] = {
    "hook_font_size": (36, 96),
    "hook_top": (200, 900),
    "hook_max_lines": (1, 5),
    "hook_chars_per_line": (12, 40),
    "hook_box_opacity": (0.0, 0.9),
    "credit_font_size": (22, 48),
    "credit_box_opacity": (0.0, 0.9),
}


def normalize(raw: dict | None) -> dict:
    """Fill missing fields with defaults and clamp everything into a range the renderer can handle."""
    raw = raw or {}
    out = dict(DEFAULTS)
    for key, (lo, hi) in LIMITS.items():
        if key not in raw:
            continue
        try:
            val = float(raw[key])
        except (TypeError, ValueError):
            continue
        val = min(max(val, lo), hi)
        out[key] = round(val, 2) if isinstance(DEFAULTS[key], float) else int(round(val))
    for key in ("hook_enabled", "credit_enabled"):
        if isinstance(raw.get(key), bool):
            out[key] = raw[key]
    if raw.get("credit_position") in CREDIT_POSITIONS:
        out["credit_position"] = raw["credit_position"]
    return out


def to_json(style: dict) -> str:
    return json.dumps(normalize(style), sort_keys=True)


def from_json(text: str | None) -> dict:
    try:
        return normalize(json.loads(text or "{}"))
    except (TypeError, ValueError):
        return dict(DEFAULTS)
