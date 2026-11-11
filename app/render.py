"""Turns a downloaded Reddit video into an Instagram-ready 9:16 Reel with ffmpeg.

Layout: the original video centered on a blurred copy of itself, an optional hook
text at the top, and a visible credit line for the original creator at the bottom.
Text stays inside Instagram's safe zone (top ~220 px and bottom ~600 px are covered by the app UI).
The blur is computed at quarter resolution to keep the Celeron N2930 fast enough.
"""
import logging
import subprocess
import threading
from pathlib import Path

from .config import settings

log = logging.getLogger(__name__)
W, H = 1080, 1920
_render_lock = threading.Lock()  # one encode at a time on the small CPU


class RenderError(RuntimeError):
    pass


def build_filter(hook_file: Path | None, credit_file: Path, vaapi: bool) -> str:
    font = settings.font_file
    parts = [
        "[0:v]fps=30,split=2[a][b]",
        f"[a]scale={W // 4}:{H // 4}:force_original_aspect_ratio=increase,crop={W // 4}:{H // 4},"
        f"boxblur=8:2,scale={W}:{H},setsar=1,eq=brightness=-0.08[bg]",
        f"[b]scale={W}:{H}:force_original_aspect_ratio=decrease,setsar=1[fg]",
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[base]",
    ]
    chain = "[base]"
    if hook_file is not None:
        chain += (f"drawtext=fontfile={font}:textfile={hook_file}:expansion=none:fontsize=62:fontcolor=white:"
                  "line_spacing=14:box=1:boxcolor=black@0.55:boxborderw=26:x=(w-text_w)/2:y=250,")
    chain += (f"drawtext=fontfile={font}:textfile={credit_file}:expansion=none:fontsize=34:fontcolor=white@0.92:"
              "box=1:boxcolor=black@0.45:boxborderw=14:x=(w-text_w)/2:y=h-640")
    chain += ",format=nv12,hwupload[v]" if vaapi else ",format=yuv420p[v]"
    parts.append(chain)
    return ";".join(parts)


def build_command(video: Path, audio: Path | None, out: Path, hook_file: Path | None,
                  credit_file: Path, encoder: str, max_seconds: int = 90) -> list[str]:
    vaapi = encoder == "vaapi"
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    if vaapi:
        cmd += ["-vaapi_device", "/dev/dri/renderD128"]
    cmd += ["-i", str(video)]
    if audio:
        cmd += ["-i", str(audio)]
    else:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
    cmd += ["-filter_complex", build_filter(hook_file, credit_file, vaapi), "-map", "[v]", "-map", "1:a:0"]
    if audio:
        cmd += ["-af", "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000"]
    if vaapi:
        cmd += ["-c:v", "h264_vaapi", "-qp", "23", "-profile:v", "high"]
    else:
        cmd += ["-c:v", "libx264", "-preset", settings.x264_preset, "-crf", "23", "-profile:v", "high",
                "-level", "4.1", "-maxrate", "8M", "-bufsize", "16M"]
    cmd += ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
            "-shortest", "-t", str(max_seconds), "-movflags", "+faststart", str(out)]
    return cmd


def render(video: Path, audio: Path | None, out: Path, hook: str | None, credit: str,
           work_dir: Path, max_seconds: int = 90) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    hook_file = None
    if hook:
        hook_file = work_dir / "hook.txt"
        hook_file.write_text(hook, encoding="utf-8")
    credit_file = work_dir / "credit.txt"
    credit_file.write_text(credit, encoding="utf-8")

    encoders = [settings.encoder] + (["libx264"] if settings.encoder != "libx264" else [])
    last_err = ""
    with _render_lock:
        for enc in encoders:
            cmd = build_command(video, audio, out, hook_file, credit_file, enc, max_seconds)
            proc = subprocess.run(cmd, capture_output=True, text=True)
            if proc.returncode == 0 and out.exists() and out.stat().st_size > 0:
                return out
            last_err = proc.stderr[-800:]
            log.warning("Encoder %s fehlgeschlagen: %s", enc, last_err)
    raise RenderError(f"ffmpeg fehlgeschlagen: {last_err}")
