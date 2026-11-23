"""Caption and hook text helpers."""
import re

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


def wrap_words(text: str, width: int) -> list[str]:
    """Greedy word wrap; words longer than a line are split. Mirrored in web/lib/overlay.ts (wrapWords)."""
    lines: list[str] = []
    cur = ""
    for word in text.split():
        while len(word) > width:
            if cur:
                lines.append(cur)
                cur = ""
            lines.append(word[:width])
            word = word[width:]
        if not word:
            continue
        if not cur:
            cur = word
        elif len(cur) + 1 + len(word) <= width:
            cur += " " + word
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def hook_lines(title: str, width: int = 24, max_lines: int = 3) -> str:
    """Hook text for the top of the reel. Too long titles are cut after max_lines with an ellipsis."""
    title = clean_title(title)
    lines = wrap_words(title, width)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(".,;:!? ") + "…"
    return "\n".join(lines)
