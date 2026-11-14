import asyncio
import threading
from http.server import HTTPServer
from pathlib import Path

import pytest
from pydub import AudioSegment
from pydub.generators import Sine

from core.builder import build
from core.parser import ScriptError, parse_script
from providers.aivis import AivisProvider
from providers.base import SynthRequest
from tests.test_aivis import _AivisHandler, MOCK_SPEAKERS  # noqa: F401 (tái dùng mock server)


def _line(tmp_path: Path, name: str, ms: int) -> str:
    path = tmp_path / f"{name}.wav"
    Sine(440).to_audio_segment(ms).apply_gain(-6).export(path, format="wav")
    return str(path)


def test_parser_accepts_tempo_pre_post():
    items = parse_script("[1]{tempo=1.2, pre=300, post=500} はい。")
    assert items[0]["attrs"] == {"tempo": "1.2", "pre": "300", "post": "500"}


@pytest.mark.parametrize("attr", ["tempo=3", "tempo=abc", "pre=-100", "post=1.5"])
def test_parser_rejects_bad_values(attr):
    with pytest.raises(ScriptError):
        parse_script(f"[1]{{{attr}}} はい。")


def test_pre_and_post_silence_shift_the_line(tmp_path):
    line = _line(tmp_path, "a", 400)
    base = [{"type": "line", "id": "L1", "src_line": 1, "role": "1", "audio": line, "plain": "はい。"},
            {"type": "line", "id": "L2", "src_line": 2, "role": "2", "audio": line, "plain": "はい。"}]
    timing = {"lead_in_ms": 0, "tail_ms": 0, "turn_gap_ms": 600, "same_speaker_gap_ms": 400}
    _, plain = build([dict(x) for x in base], timing)

    with_pre = [dict(base[0], attrs={"pre": "300"}), dict(base[1])]
    _, shifted = build(with_pre, timing)
    assert shifted[0]["start_ms"] - plain[0]["start_ms"] == 300

    with_post = [dict(base[0], attrs={"post": "700"}), dict(base[1])]
    _, after = build(with_post, timing)
    # Lặng sau câu 1 cộng thêm 700 ms vào khoảng nghỉ trước câu 2
    assert after[1]["start_ms"] - plain[1]["start_ms"] == 700


def test_tempo_reaches_engine_payload(tmp_path):
    server = HTTPServer(("127.0.0.1", 0), _AivisHandler)
    _AivisHandler.recorded_queries = []
    _AivisHandler.recorded_syntheses = []
    _AivisHandler.simulate_error = False
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{server.server_port}"
        provider = AivisProvider(base_url=url)
        req = SynthRequest(text="はい", voice="888753760", tempo=1.3)
        asyncio.run(provider.synthesize(req, str(tmp_path / "t.wav")))
    finally:
        server.shutdown()
    assert _AivisHandler.recorded_syntheses[0]["payload"]["tempoDynamicsScale"] == 1.3
