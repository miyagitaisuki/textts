import asyncio
import math
import struct
import sys
import wave
from pathlib import Path

import pyloudnorm as pyln
import numpy as np
import pytest
from aiohttp import web
from pydub import AudioSegment

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.audio import loudness_normalize, time_stretch  # noqa: E402
from providers.base import SynthRequest  # noqa: E402
from providers.voicevox import VoicevoxProvider  # noqa: E402
import tts  # noqa: E402
from core.models import LineItem, Project  # noqa: E402


def _tone(ms: int, freq: float = 440.0, amp: float = 0.3, rate: int = 24000) -> AudioSegment:
    n = int(rate * ms / 1000)
    frames = b"".join(
        struct.pack("<h", int(amp * 32767 * math.sin(2 * math.pi * freq * i / rate))) for i in range(n)
    )
    seg = AudioSegment(data=frames, sample_width=2, frame_rate=rate, channels=1)
    return seg


def _wav_bytes(seg: AudioSegment) -> bytes:
    import io
    buf = io.BytesIO()
    seg.export(buf, format="wav")
    return buf.getvalue()


# ---------- VOICEVOX ----------

def test_voicevox_calls_audio_query_then_synthesis_with_scales(tmp_path):
    seen = {}
    wav = _wav_bytes(_tone(300))

    async def audio_query(request):
        seen["query_params"] = dict(request.query)
        return web.json_response({"text": request.query["text"], "speedScale": 1.0, "pitchScale": 0.0})

    async def synthesis(request):
        seen["synth_params"] = dict(request.query)
        seen["body"] = await request.json()
        return web.Response(body=wav, content_type="audio/wav")

    async def run():
        app = web.Application()
        app.router.add_post("/audio_query", audio_query)
        app.router.add_post("/synthesis", synthesis)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        try:
            out = tmp_path / "x.wav"
            provider = VoicevoxProvider(base_url=f"http://127.0.0.1:{port}")
            await provider.synthesize(
                SynthRequest(text="はい", voice="3", speed="slow", pitch=-50), str(out)
            )
            return out
        finally:
            await runner.cleanup()

    out = asyncio.run(run())
    assert out.read_bytes() == wav
    assert seen["query_params"] == {"text": "はい", "speaker": "3"}
    assert seen["synth_params"] == {"speaker": "3"}
    assert seen["body"]["speedScale"] == 0.85
    assert seen["body"]["pitchScale"] == -0.15  # bị chặn trong khoảng ±0.15


def test_voicevox_ext_is_wav_and_registered():
    assert VoicevoxProvider.ext == "wav"
    assert tts.PROVIDERS["voicevox"] is VoicevoxProvider


def test_voicevox_rejects_unknown_speed(tmp_path):
    with pytest.raises(ValueError):
        asyncio.run(VoicevoxProvider("http://127.0.0.1:1").synthesize(
            SynthRequest(text="はい", voice="3", speed="turbo"), str(tmp_path / "x.wav")))


# ---------- chậm và LUFS ----------

def test_time_stretch_slows_down_without_changing_pitch_length():
    seg = _tone(1000)
    slow = time_stretch(seg, 0.8)
    assert abs(len(slow) - 1250) < 60  # 1000 ms / 0.8


def test_loudness_normalize_hits_target():
    seg = _tone(2000, amp=0.05)
    out = loudness_normalize(seg, -16.0)
    samples = np.array(out.get_array_of_samples(), dtype=np.float64) / 32768.0
    measured = pyln.Meter(out.frame_rate).integrated_loudness(samples)
    assert abs(measured - (-16.0)) < 0.5


def test_loudness_normalize_keeps_silence():
    silent = AudioSegment.silent(duration=1000, frame_rate=24000)
    out = loudness_normalize(silent, -16.0)
    assert len(out) == len(silent)
    assert out.rms == 0


# ---------- xuất từng câu ----------

def test_export_lines_names_files_by_id_and_role(tmp_path):
    audio_dir = tmp_path / "cache"
    audio_dir.mkdir()
    a = audio_dir / "a.wav"
    b = audio_dir / "b.wav"
    _tone(200).export(a, format="wav")
    _tone(200).export(b, format="wav")
    proj = Project.model_validate({
        "engine": "edge",
        "roles": {"1": {"voice": "v"}, "2": {"voice": "v"}},
        "items": [
            {"id": "L001", "type": "line", "src_line": 1, "role": "1", "display": "はい",
             "tts_text": "", "plain": "", "audio": str(a)},
            {"id": "L002", "type": "pause", "src_line": 2, "ms": 500},
            {"id": "L003", "type": "line", "src_line": 3, "role": "2", "display": "いいえ",
             "tts_text": "", "plain": "", "audio": str(b)},
        ],
    })
    out_dir = tmp_path / "lines"
    tts.export_lines(proj, out_dir)
    assert sorted(p.name for p in out_dir.iterdir()) == ["L001_vai1.mp3", "L003_vai2.mp3"]
