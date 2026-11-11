"""Caption and hook text helpers."""
import re
import textwrap

INSTAGRAM_CAPTION_LIMIT = 2200


class _SafeDict(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def build_caption(template: str, item: dict, hashtags: str) -> str:
    values = _SafeDict(
        title=item.get("title", ""),
        author=item.get("author", ""),
        subreddit=item.get("subreddit", ""),
        permalink="https://reddit.com" + item.get("permalink", ""),
        hashtags=hashtags.strip(),
    )
    caption = template.format_map(values).strip()
    return caption[:INSTAGRAM_CAPTION_LIMIT]


def clean_title(title: str) -> str:
    title = re.sub(r"\[.*?\]|\(.*?\)", "", title)          # drop [OC], (x-post) etc.
    title = re.sub(r"\s+", " ", title).strip()
    return title


def hook_lines(title: str, width: int = 24, max_lines: int = 3) -> str:
    title = clean_title(title)
    lines = textwrap.wrap(title, width=width)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(".,;:!? ") + "…"
    return "\n".join(lines)
