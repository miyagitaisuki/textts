import sys
from pathlib import Path

import pytest
from pydub import AudioSegment
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.audio import add_background, peaks  # noqa: E402
from core.builder import build  # noqa: E402
from core.models import Project  # noqa: E402
from core.parser import parse_script  # noqa: E402
import tts  # noqa: E402


def _tone(ms, amp=0.3, freq=440):
    import math, struct
    rate = 24000
    n = int(rate * ms / 1000)
    data = b"".join(struct.pack("<h", int(amp * 32767 * math.sin(2 * math.pi * freq * i / rate)))
                    for i in range(n))
    return AudioSegment(data=data, sample_width=2, frame_rate=rate, channels=1)


def test_parser_reads_sfx_line():
    items = parse_script("[1] はい。\n[sfx=sounds/bell.wav]\n[2] いいえ。")
    assert items[1]["type"] == "sfx"
    assert items[1]["path"] == "sounds/bell.wav"


def test_sfx_model_requires_path():
    with pytest.raises(ValidationError):
        Project.model_validate({"engine": "e", "roles": {"1": {"voice": "v"}}, "items": [
            {"id": "L001", "type": "line", "src_line": 1, "role": "1", "display": "はい",
             "tts_text": "", "plain": ""},
            {"id": "L002", "type": "sfx", "src_line": 2, "path": ""}]})


def test_builder_inserts_sfx_audio(tmp_path):
    sfx = tmp_path / "bell.wav"
    _tone(500).export(sfx, format="wav")
    items = [
        {"type": "sfx", "path": str(sfx), "id": "L001", "src_line": 1},
    ]
    audio, placed = build(items, {"lead_in_ms": 0, "tail_ms": 0})
    assert abs(len(audio) - 500) < 30
    assert placed == []


def test_background_loops_and_stays_under_speech():
    speech = _tone(5000, amp=0.3)
    bgm = _tone(1000, amp=0.3, freq=220)
    mixed = add_background(speech, bgm, gain_db=-18)
    assert len(mixed) == len(speech)
    # Nhạc nền nhỏ hơn: biên độ đỉnh chỉ tăng nhẹ so với lời thoại
    assert mixed.max_dBFS <= speech.max_dBFS + 1.0


def test_peaks_normalized_and_bounded():
    values = peaks(_tone(1000, amp=0.5), bins=50)
    assert len(values) == 50
    assert max(values) == 1.0
    assert all(0.0 <= v <= 1.0 for v in values)


def test_dry_run_prints_sfx(tmp_path, capsys):
    script = tmp_path / "s.txt"
    script.write_text("[1] はい。\n[sfx=bell.wav]", encoding="utf-8")
    cfg = tts.load_config(ROOT / "roles.yaml")
    proj = tts.project_from_script(script, cfg)
    tts.dry_run(proj)
    assert "[sfx bell.wav]" in capsys.readouterr().out


def test_missing_sfx_file_is_reported(tmp_path, capsys):
    script = tmp_path / "s.txt"
    script.write_text("[1] はい。\n[sfx=khong_co.wav]", encoding="utf-8")
    code = tts.main([str(script), "-o", str(tmp_path / "o.mp3"), "--cache-dir", str(tmp_path / "c")])
    assert code == 2
    assert "khong_co.wav" in capsys.readouterr().err
