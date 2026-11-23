"""Turns a downloaded Reddit video into an Instagram-ready 9:16 Reel with ffmpeg.

Layout: the original video centered on a blurred copy of itself, an optional hook
text at the top, and a small credit line for the original creator at an edge of the frame.
Sizes and positions come from the account's preset (app/presets.py) and stay inside
Instagram's safe zone (the app UI covers the top ~220 px and the bottom ~450 px).
The blur is computed at quarter resolution to keep the Celeron N2930 fast enough.
"""
import logging
import re
import subprocess
import threading
from collections.abc import Callable
from pathlib import Path

from . import presets
from .config import settings

log = logging.getLogger(__name__)
W, H = 1080, 1920
_render_lock = threading.Lock()  # one encode at a time on the small CPU


class RenderError(RuntimeError):
    pass


def build_filter(hook_file: Path | None, credit_file: Path, vaapi: bool, style: dict | None = None) -> str:
    font = settings.font_file
    st = presets.normalize(style)
    cx, cy = presets.CREDIT_POSITIONS[st["credit_position"]]
    parts = [
        "[0:v]fps=30,split=2[a][b]",
        f"[a]scale={W // 4}:{H // 4}:force_original_aspect_ratio=increase,crop={W // 4}:{H // 4},"
        f"boxblur=8:2,scale={W}:{H},setsar=1,eq=brightness=-0.08[bg]",
        f"[b]scale={W}:{H}:force_original_aspect_ratio=decrease,setsar=1[fg]",
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[base]",
    ]
    texts = []
    if hook_file is not None and st["hook_enabled"]:
        texts.append(f"drawtext=fontfile={font}:textfile={hook_file}:expansion=none:fontsize={st['hook_font_size']}:"
                     f"fontcolor=white:line_spacing=14:box=1:boxcolor=black@{st['hook_box_opacity']}:boxborderw=26:"
                     f"x=(w-text_w)/2:y={st['hook_top']}")
    if st["credit_enabled"]:
        texts.append(f"drawtext=fontfile={font}:textfile={credit_file}:expansion=none:fontsize={st['credit_font_size']}:"
                     f"fontcolor=white@0.9:box=1:boxcolor=black@{st['credit_box_opacity']}:boxborderw=12:x={cx}:y={cy}")
    texts.append("format=nv12,hwupload" if vaapi else "format=yuv420p")
    chain = "[base]" + ",".join(texts) + "[v]"
    parts.append(chain)
    return ";".join(parts)


def build_command(video: Path, audio: Path | None, out: Path, hook_file: Path | None,
                  credit_file: Path, encoder: str, max_seconds: int = 90, style: dict | None = None) -> list[str]:
    vaapi = encoder == "vaapi"
    # -progress: key=value blocks on stdout (out_time_us=...) that render() turns into a percentage
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostats", "-progress", "pipe:1", "-y"]
    if vaapi:
        cmd += ["-vaapi_device", "/dev/dri/renderD128"]
    cmd += ["-i", str(video)]
    if audio:
        cmd += ["-i", str(audio)]
    else:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
    cmd += ["-filter_complex", build_filter(hook_file, credit_file, vaapi, style), "-map", "[v]", "-map", "1:a:0"]
    if audio:
        # apad: Reddit audio is often a few frames shorter than the video; -shortest then ends with the video
        cmd += ["-af", "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,apad"]
    if vaapi:
        cmd += ["-c:v", "h264_vaapi", "-qp", "23", "-profile:v", "high"]
    else:
        cmd += ["-c:v", "libx264", "-preset", settings.x264_preset, "-crf", "23", "-profile:v", "high",
                "-level", "4.1", "-maxrate", "8M", "-bufsize", "16M"]
    cmd += ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
            "-shortest", "-t", str(max_seconds), "-movflags", "+faststart", str(out)]
    return cmd


ProgressFn = Callable[[str, float | None], None]


def media_duration(path: Path) -> float | None:
    """Container duration in seconds (ffprobe), None if unknown."""
    proc = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                          capture_output=True, text=True)
    try:
        d = float(proc.stdout.strip())
    except ValueError:
        return None
    return d if d > 0 else None


def parse_progress_line(line: str) -> float | None:
    """Seconds already encoded from one `-progress` line (out_time_us / out_time_ms are both microseconds)."""
    key, _, value = line.strip().partition("=")
    if key in ("out_time_us", "out_time_ms"):
        try:
            us = int(value)
        except ValueError:  # "N/A" at the very start
            return None
        return max(0, us) / 1_000_000
    return None


def _run_ffmpeg(cmd: list[str], total: float | None, log_file: Path, on_progress: ProgressFn | None) -> int:
    """Run ffmpeg, report percent from its progress output. stderr goes to a file so the pipe never blocks."""
    with open(log_file, "w", encoding="utf-8", errors="replace") as err:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=err, text=True, bufsize=1)
        last = -1.0
        assert proc.stdout is not None
        for line in proc.stdout:
            if on_progress is None:
                continue
            secs = parse_progress_line(line)
            if secs is not None and total:
                pct = min(99.0, secs / total * 100)  # 100 only once the file is complete
                if pct - last >= 0.5:
                    last = pct
                    on_progress("render", pct)
            elif line.startswith("progress=") and not total:
                on_progress("render", None)
        return proc.wait()


def render(video: Path, audio: Path | None, out: Path, hook: str | None, credit: str,
           work_dir: Path, max_seconds: int = 90, style: dict | None = None,
           on_progress: ProgressFn | None = None) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    hook_file = None
    if hook:
        hook_file = work_dir / "hook.txt"
        hook_file.write_text(hook, encoding="utf-8")
    credit_file = work_dir / "credit.txt"
    credit_file.write_text(credit, encoding="utf-8")
    duration = media_duration(video)
    total = min(duration, max_seconds) if duration else None
    log_file = work_dir / "ffmpeg.log"

    encoders = [settings.encoder] + (["libx264"] if settings.encoder != "libx264" else [])
    last_err = ""
    if not _render_lock.acquire(blocking=False):
        if on_progress:
            on_progress("waiting", None)  # another reel is encoding right now
        _render_lock.acquire()
    try:
        for enc in encoders:
            if on_progress:
                on_progress("render", 0.0 if total else None)
            cmd = build_command(video, audio, out, hook_file, credit_file, enc, max_seconds, style)
            code = _run_ffmpeg(cmd, total, log_file, on_progress)
            if code == 0 and out.exists() and out.stat().st_size > 0:
                if on_progress:
                    on_progress("render", 100.0)
                return out
            last_err = log_file.read_text(encoding="utf-8", errors="replace")[-800:]
            log.warning("Encoder %s fehlgeschlagen: %s", enc, last_err)
    finally:
        _render_lock.release()
    raise RenderError(f"ffmpeg fehlgeschlagen: {last_err}")


SILENCE_DB = -50.0  # peak below this counts as a muted source


def audio_peak_db(path: Path) -> float | None:
    """Peak level of the first audio stream in dB (volumedetect), None if the file has no audio."""
    proc = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-map", "0:a:0",
                           "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"max_volume:\s*(-?[\d.]+|-inf) dB", proc.stderr)
    if proc.returncode != 0 or not m:
        return None
    return float("-inf") if m.group(1) == "-inf" else float(m.group(1))


def has_audio_stream(path: Path) -> bool:
    proc = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                           "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    return proc.returncode == 0 and bool(proc.stdout.strip())
