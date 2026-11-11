"""--sample: đọc thử một câu mẫu bằng một giọng để chọn nhanh giọng cho vai."""
from pydub import AudioSegment
from pydub.generators import Sine

import tts
from providers.base import TTSProvider


class FakeProvider(TTSProvider):
    name = "fake"
    ext = "wav"
    calls = []

    async def synthesize(self, req, out_path):
        FakeProvider.calls.append(req)
        Sine(440).to_audio_segment(300).export(out_path, format="wav")


def test_sample_writes_audio_and_uses_cache(tmp_path, monkeypatch):
    monkeypatch.setitem(tts.PROVIDERS, "fake", FakeProvider)
    FakeProvider.calls = []
    out = tmp_path / "s.wav"
    argv = ["--sample", "fake", "--voice", "3", "--emotion", "happy", "--speed", "slow", "--pitch", "5",
            "--cache-dir", str(tmp_path / "cache"), "-o", str(out)]
    assert tts.main(argv) == 0
    assert abs(len(AudioSegment.from_file(out)) - 300) < 20
    req = FakeProvider.calls[0]
    assert (req.text, req.voice, req.emotion, req.speed, req.pitch) == (tts.SAMPLE_TEXT, "3", "happy", "slow", 5)
    # Lần thứ hai cùng giọng: lấy từ cache, không gọi engine nữa.
    assert tts.main(argv) == 0
    assert len(FakeProvider.calls) == 1


def test_sample_reports_engine_error(tmp_path, monkeypatch, capsys):
    class Broken(FakeProvider):
        async def synthesize(self, req, out_path):
            raise ConnectionError("engine chưa bật")

    monkeypatch.setitem(tts.PROVIDERS, "fake", Broken)
    code = tts.main(["--sample", "fake", "--voice", "3", "--cache-dir", str(tmp_path), "-o", str(tmp_path / "s.mp3")])
    assert code == 1
    assert "engine chưa bật" in capsys.readouterr().err
    assert not list(tmp_path.glob("*.part"))
