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
