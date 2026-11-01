from pathlib import Path

from tts import sfx_path


def test_relative_sfx_resolves_against_base_dir(tmp_path):
    base = tmp_path / "bai"
    assert sfx_path("sounds/bell.wav", base) == base / "sounds" / "bell.wav"


def test_absolute_sfx_is_kept(tmp_path):
    absolute = tmp_path / "bell.wav"
    assert sfx_path(str(absolute), Path("/nowhere")) == absolute
