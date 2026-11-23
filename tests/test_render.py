import shutil
import subprocess

import pytest

from app import render

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg fehlt")


def test_render_landscape_to_reel(tmp_path):
    src = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25",
                    "-t", "3", "-c:v", "libx264", "-preset", "ultrafast", str(src)], check=True)
    out = render.render(src, None, tmp_path / "out.mp4", "Hook text", "Video: u/x · r/y", tmp_path / "w")
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,width,height",
                            "-of", "csv=p=0", str(out)], capture_output=True, text=True, check=True).stdout
    assert "h264,1080,1920" in probe and "aac" in probe


def _probe(path):
    return subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height",
                           "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True).stdout


def test_render_keeps_reddit_audio_and_uses_preset(tmp_path):
    src, aud = tmp_path / "v.mp4", tmp_path / "a.mp4"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=25",
                    "-t", "3", "-c:v", "libx264", "-preset", "ultrafast", str(src)], check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2.5",
                    "-c:a", "aac", str(aud)], check=True)
    assert render.audio_peak_db(aud) > render.SILENCE_DB
    assert render.audio_peak_db(src) is None and not render.has_audio_stream(src)
    style = {"credit_position": "top_right", "hook_font_size": 50, "hook_max_lines": 2}
    out = render.render(src, aud, tmp_path / "out.mp4", "Hook", "Video: u/x · r/y", tmp_path / "w", style=style)
    assert "aac" in _probe(out)
    # the Reddit tone made it into the reel (not the silent placeholder track)
    assert render.audio_peak_db(out) > render.SILENCE_DB


def test_silent_track_detected(tmp_path):
    aud = tmp_path / "a.mp4"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                    "-t", "2", "-c:a", "aac", str(aud)], check=True)
    peak = render.audio_peak_db(aud)
    assert peak is not None and peak < render.SILENCE_DB


def test_build_filter_uses_preset_positions(tmp_path):
    f = render.build_filter(tmp_path / "h.txt", tmp_path / "c.txt", False,
                            {"credit_position": "top_left", "hook_top": 400, "hook_font_size": 999})
    assert "y=400" in f and "fontsize=96" in f  # clamped
    assert "x=54:y=240" in f
    default = render.build_filter(None, tmp_path / "c.txt", False)
    assert "x=54:y=h-text_h-480" in default
