"""Chú âm dạng ngoặc tròn, tách câu trong một câu thoại và khoảng lặng giữa các câu."""
import asyncio
from pathlib import Path

from pydub import AudioSegment
from pydub.generators import Sine

from core.builder import DEFAULT_TIMING
from core.models import LineItem, Project, Role, Timing
from core.parser import parse_script
from providers.base import SynthRequest, TTSProvider
from tts import cache_key, split_sentences, synth_all


def test_parenthesised_furigana_sends_only_kana():
    items = parse_script("[1] 素晴(すば)らしい意欲（いよく）ですね。駅{えき}はどこ？\n")
    line = items[0]
    assert line["tts_text"] == "すばらしいいよくですね。えきはどこ？"
    assert line["plain"] == "素晴らしい意欲ですね。駅はどこ？"
    assert line["display"] == "素晴(すば)らしい意欲（いよく）ですね。駅{えき}はどこ？"


def test_ordinary_parentheses_are_kept():
    item = LineItem(id="L001", src_line=1, role="1", display="はい(笑)。AI(エーアイ)です", tts_text="", plain="")
    assert item.tts_text == "はい(笑)。AI(エーアイ)です"


def test_split_sentences():
    assert split_sentences("はい。貴社が開発されている、AIです！本当ですか？") == [
        "はい。", "貴社が開発されている、AIです！", "本当ですか？"]
    assert split_sentences("「はい。」そうです") == ["「はい。」", "そうです"]
    assert split_sentences("読点だけ、の文") == ["読点だけ、の文"]


def test_recommended_defaults_match():
    t = Timing()
    assert (t.turn_gap_ms, t.same_speaker_gap_ms, t.question_gap_ms) == (600, 400, 200)
    assert t.sentence_pause_ms == 500 and t.comma_pause_scale == 1.5
    for k, v in DEFAULT_TIMING.items():
        assert getattr(t, k) == v


def test_cache_key_keeps_old_value_and_changes_with_pause_scale():
    import hashlib
    req = SynthRequest(text="はい", voice="v")
    legacy = hashlib.sha1("|".join(["edge", "v", "neutral", "normal", "0", "はい"]).encode()).hexdigest()
    assert cache_key("edge", req) == legacy  # cache cũ vẫn dùng được
    assert cache_key("edge", SynthRequest(text="はい", voice="v", pause_scale=1.5)) != legacy


class ToneProvider(TTSProvider):
    """Mỗi câu: 100 ms lặng + 300 ms tiếng + 100 ms lặng; ghi lại các câu và pause_scale nhận được."""

    name = "tone"
    ext = "wav"
    supports_pause_scale = True

    def __init__(self):
        self.calls = []

    async def synthesize(self, req, out_path):
        self.calls.append((req.text, req.pause_scale))
        seg = AudioSegment.silent(100) + Sine(440).to_audio_segment(300).apply_gain(-6) + AudioSegment.silent(100)
        seg.export(out_path, format="wav")


def _project(display, **timing):
    return Project(
        engine="tone",
        timing=Timing(**timing),
        roles={"1": Role(voice="v")},
        items=[LineItem(id="L001", src_line=1, role="1", display=display, tts_text="", plain="")],
    )


def test_line_with_several_sentences_gets_pauses(tmp_path):
    provider = ToneProvider()
    project = _project("はい、わかりました。そうなんです！", sentence_pause_ms=500, comma_pause_scale=1.5)
    assert asyncio.run(synth_all(project, provider, tmp_path)) == []
    assert sorted(provider.calls) == [("そうなんです！", 1.5), ("はい、わかりました。", 1.5)]
    joined = AudioSegment.from_file(project.items[0].audio)
    # 2 câu x (300 ms tiếng + ~2 x 40 ms đệm) + 500 ms lặng; nếu không cắt lặng của engine sẽ là 1500 ms.
    # Sai số do pydub dò lặng theo khối 10 ms.
    assert abs(len(joined) - (2 * 380 + 500)) <= 60
    assert len(joined) < 1400


def test_sentence_pause_zero_reads_line_in_one_go(tmp_path):
    provider = ToneProvider()
    project = _project("はい。そうです！", sentence_pause_ms=0)
    assert asyncio.run(synth_all(project, provider, tmp_path)) == []
    assert provider.calls == [("はい。そうです！", 1.5)]
    assert Path(project.items[0].audio).exists()


def test_build_keeps_pauses_inside_a_line(tmp_path):
    """build() chỉ cắt lặng ở hai đầu câu thoại: khoảng dừng 800 ms sau 。 phải còn nguyên.

    Trước đây pydub.effects.strip_silence xóa cả khoảng lặng ở giữa, làm câu dính liền.
    """
    from pydub.silence import detect_silence

    from core.builder import build

    tone = Sine(440).to_audio_segment(400).apply_gain(-6)
    line = AudioSegment.silent(150) + tone + AudioSegment.silent(800) + tone + AudioSegment.silent(150)
    path = tmp_path / "line.wav"
    line.export(path, format="wav")
    items = [{"type": "line", "id": "L001", "src_line": 1, "role": "1", "audio": str(path), "plain": "はい。そう。"}]
    audio, placed = build(items, {"lead_in_ms": 0, "tail_ms": 0})
    seg = audio[placed[0]["start_ms"]:placed[0]["end_ms"]]
    inner = [e - s for s, e in detect_silence(seg, min_silence_len=100, silence_thresh=-45)
             if s > 50 and e < len(seg) - 50]
    assert inner and abs(inner[0] - 800) <= 20
    # Hai đầu vẫn được cắt, chỉ giữ ~40 ms đệm.
    assert abs(len(seg) - (400 + 800 + 400 + 2 * 40)) <= 20


def test_lead_in_and_tail_default_to_two_seconds():
    # Đủ lặng hai đầu để chế độ repeat không lặp đột ngột và câu cuối không bị cắt.
    t = Timing()
    assert t.lead_in_ms == 2000 and t.tail_ms == 2000


def test_limit_peak_keeps_headroom():
    from pydub.generators import Sine
    from core.audio import limit_peak
    loud = Sine(440).to_audio_segment(500, volume=0.0)
    assert limit_peak(loud).max_dBFS <= -1.0 + 0.05
    quiet = Sine(440).to_audio_segment(500, volume=-12.0)
    assert abs(limit_peak(quiet).max_dBFS - quiet.max_dBFS) < 0.01


def test_merge_short():
    from tts import merge_short
    assert merge_short(["はい。", "貴社が開発されているAIです。"]) == ["はい。貴社が開発されているAIです。"]
    assert merge_short(["貴社が開発されているAIです。", "はい。"]) == ["貴社が開発されているAIです。はい。"]
    assert merge_short(["はい。"]) == ["はい。"]
