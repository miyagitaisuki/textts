import math
import struct
import sys
from pathlib import Path

from pydub import AudioSegment

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.audio import role_levels  # noqa: E402


def _tone(ms, amp, rate=24000):
    n = int(rate * ms / 1000)
    data = b"".join(struct.pack("<h", int(amp * 32767 * math.sin(2 * math.pi * 440 * i / rate)))
                    for i in range(n))
    return AudioSegment(data=data, sample_width=2, frame_rate=rate, channels=1)


def test_levels_follow_only_their_own_role_segments():
    # Vai 1 nói 0–1 s (to), vai 2 nói 2–3 s (nhỏ hơn 20 dB), im lặng ở giữa
    audio = _tone(1000, 0.5) + AudioSegment.silent(1000, frame_rate=24000) + _tone(1000, 0.05)
    placed = [
        {"role": "1", "start_ms": 0, "end_ms": 1000},
        {"role": "2", "start_ms": 2000, "end_ms": 3000},
    ]
    levels = role_levels(audio, placed, bins=30)
    assert set(levels) == {"1", "2"}
    r1, r2 = levels["1"], levels["2"]
    assert len(r1) == len(r2) == 30
    # Vai 1 chỉ có mức ở nửa đầu, vai 2 chỉ ở nửa cuối
    assert max(r1[:14]) > 0.5 and max(r1[18:]) < 0.05
    assert max(r2[:14]) < 0.05 and max(r2[18:]) > 0.0
    # Vai to hơn thì thanh cao hơn
    assert max(r1) > max(r2)


def test_silence_is_zero_and_empty_inputs_safe():
    silent = AudioSegment.silent(500, frame_rate=24000)
    levels = role_levels(silent, [{"role": "1", "start_ms": 0, "end_ms": 500}], bins=10)
    assert levels["1"] == [0.0] * 10
    assert role_levels(silent, [], bins=10) == {}
