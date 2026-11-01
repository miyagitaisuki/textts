import math
import struct
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError
from pydub import AudioSegment

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.builder import build  # noqa: E402
from core.models import LineItem, Role  # noqa: E402


def _tone_file(path, ms=500, amp=0.3):
    rate = 24000
    n = int(rate * ms / 1000)
    data = b"".join(struct.pack("<h", int(amp * 32767 * math.sin(2 * math.pi * 440 * i / rate)))
                    for i in range(n))
    AudioSegment(data=data, sample_width=2, frame_rate=rate, channels=1).export(path, format="wav")
    return str(path)


def _line(path, role="1", **extra):
    return {"type": "line", "id": "L001", "src_line": 1, "role": role, "audio": path,
            "plain": "はい", **extra}


def test_gain_changes_level_of_that_role_only(tmp_path):
    f = _tone_file(tmp_path / "a.wav")
    base, _ = build([_line(f)], {"lead_in_ms": 0, "tail_ms": 0})
    loud, _ = build([_line(f)], {"lead_in_ms": 0, "tail_ms": 0}, role_gains={"1": 6.0})
    other, _ = build([_line(f)], {"lead_in_ms": 0, "tail_ms": 0}, role_gains={"2": 6.0})
    assert loud.dBFS - base.dBFS == pytest.approx(6.0, abs=0.3)
    assert other.dBFS == pytest.approx(base.dBFS, abs=0.1)


def test_delay_shifts_start_of_that_line_and_later_ones(tmp_path):
    f = _tone_file(tmp_path / "a.wav", ms=300)
    items = [
        _line(f, id="L001"),
        _line(f, id="L002", delay_ms=700),
        _line(f, id="L003"),
    ]
    _, placed = build(items, {"lead_in_ms": 0, "tail_ms": 0, "turn_gap_ms": 0,
                              "same_speaker_gap_ms": 0})
    starts = [p["start_ms"] for p in placed]
    assert starts[1] - starts[0] >= 300 + 700 - 5
    assert starts[2] - starts[1] >= 300 + 0 - 5
    assert starts[2] > starts[1]


def test_role_gain_bounds_validated():
    with pytest.raises(ValidationError):
        Role(voice="v", gain_db=20.0)
    assert Role(voice="v", gain_db=-6.0).gain_db == -6.0


def test_delay_must_not_be_negative():
    with pytest.raises(ValidationError):
        LineItem(id="L001", src_line=1, role="1", display="はい", tts_text="", plain="", delay_ms=-5)
