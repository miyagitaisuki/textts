"""Đạo diễn kịch bản, cảnh, trình độ, nhân vật, song ngữ, gói bài học, kiểm tra phát âm."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from pydub import AudioSegment
from pydub.generators import Sine

from core.audio import apply_fx, apply_scenes
from core.builder import build
from core.levels import timing_for
from core.parser import ScriptError, parse_script

T0 = {"lead_in_ms": 0, "tail_ms": 0, "turn_gap_ms": 500, "same_speaker_gap_ms": 300, "question_gap_ms": 0}


def _wav(tmp_path: Path, name: str, ms: int, freq: int = 440) -> str:
    p = tmp_path / name
    Sine(freq).to_audio_segment(ms, volume=-10).export(p, format="wav")
    return str(p)


def _line(id_, role, audio, attrs=None):
    return {"type": "line", "id": id_, "role": role, "audio": audio, "plain": "x", "attrs": attrs or {}}


def test_parser_reads_direction_scenes_and_translation():
    items = parse_script("[bgm=quan-ca-phe]\n[1]{fx=phone, overlap=300} もしもし。 // A lô.\n"
                         "[sfx=chuong-cua, overlay, vol=-6]\n[bgm=off]\n[2] はい。")
    assert items[0] == {"type": "bgm", "layers": ["quan-ca-phe"], "src_line": 1, "id": "L001"}
    assert items[1]["attrs"] == {"fx": "phone", "overlap": "300"}
    assert items[1]["translation"] == "A lô." and items[1]["display"] == "もしもし。"
    assert items[2]["overlay"] is True and items[2]["volume_db"] == -6.0
    assert items[3]["layers"] == []
    with pytest.raises(ScriptError, match="sfx"):
        parse_script("[sfx=a, bay]\n[1] はい")


def test_overlap_starts_before_previous_line_ends(tmp_path):
    a, b = _wav(tmp_path, "a.wav", 1000), _wav(tmp_path, "b.wav", 1000, 660)
    _, normal = build([_line("L1", "1", a), _line("L2", "2", b)], T0)
    _, chen = build([_line("L1", "1", a), _line("L2", "2", b, {"overlap": "300"})], T0)
    assert normal[1]["start_ms"] - normal[0]["end_ms"] >= 490  # khoảng nghỉ đổi người
    assert chen[1]["start_ms"] < chen[0]["end_ms"]  # nói chen: bắt đầu trước khi câu trước dứt


def test_overlay_sfx_does_not_take_time(tmp_path):
    a = _wav(tmp_path, "a.wav", 800)
    bell = _wav(tmp_path, "bell.wav", 600, 1200)
    markers = []
    _, placed = build([_line("L1", "1", a), {"type": "sfx", "id": "S", "path": bell, "overlay": True},
                       _line("L2", "2", a)], T0, markers=markers)
    sfx = markers[0]
    assert sfx["overlay"] is True
    assert placed[1]["start_ms"] - placed[0]["end_ms"] < 600  # câu sau không phải đợi hết tiếng chuông


def test_fx_change_the_sound():
    seg = Sine(440).to_audio_segment(500, volume=-6)
    assert apply_fx(seg, "whisper").dBFS < seg.dBFS - 5
    assert len(apply_fx(seg, "echo")) > len(seg)
    with pytest.raises(ValueError):
        apply_fx(seg, "robot")


def test_scenes_change_background_mid_lesson(tmp_path):
    speech = AudioSegment.silent(6000)
    cafe = _wav(tmp_path, "cafe.wav", 500, 300)
    out = apply_scenes(speech, [{"start_ms": 0, "layers": [{"path": cafe, "db": -10}]}, {"start_ms": 3000, "layers": []}])
    assert out[500:2000].dBFS > -40  # có nền trong cảnh 1
    assert out[4000:5500].dBFS == float("-inf")  # tắt nền ở cảnh 2


def test_level_presets():
    t, rate = timing_for("N5", {"turn_gap_ms": 600, "lead_in_ms": 2000})
    assert rate < 1 and t["turn_gap_ms"] > 600 and t["lead_in_ms"] == 2000
    assert timing_for(None, {"x": 1}) == ({"x": 1}, 1.0)


# --- API ---------------------------------------------------------------------------------------

@pytest.fixture
def api(tmp_path, monkeypatch):
    import server

    monkeypatch.setenv("TEXTTS_USER_DATA", str(tmp_path / "ud"))
    (tmp_path / "ud").mkdir()
    line = _wav(tmp_path, "line.wav", 500)

    async def fake_synth(project, provider, cache_dir):
        for it in project.items:
            if hasattr(it, "audio"):
                it.audio = line
        return []

    async def fake_cached(provider, req, cache_dir):
        return Path(line)

    monkeypatch.setattr(server, "synth_all", fake_synth)
    monkeypatch.setattr(server, "synth_cached", fake_cached)
    import tts

    monkeypatch.setattr(tts, "synth_cached", fake_cached)
    monkeypatch.setattr(server, "check_voicevox_alive", AsyncMock(return_value=True))
    monkeypatch.setattr(server, "output_dir", tmp_path / "out")
    return TestClient(server.app), tmp_path


def test_characters_fill_roles(api):
    client, tmp = api
    (tmp / "ud" / "presets.json").write_text(json.dumps([
        {"name": "Minh", "engine": "voicevox", "voice": "13", "emotion": "happy", "speed": "normal", "pitch": 2,
         "description": "nam sinh viên Việt Nam 20 tuổi"},
    ], ensure_ascii=False), encoding="utf-8")
    assert client.get("/api/v1/characters").json()["items"][0]["name"] == "Minh"
    body = {"title": "t", "script": "[1] はい。", "roles": {"1": {"character": "minh"}},
            "options": {"slow": False, "srt": False, "worksheet": False, "format": "wav"}}
    res = client.post("/api/v1/dialogue", json=body)
    assert res.status_code == 200, res.text
    bad = client.post("/api/v1/dialogue", json={**body, "roles": {"1": {"character": "Yui"}}})
    assert bad.status_code == 400 and "Minh" in bad.json()["detail"]


def test_bilingual_and_level(api):
    client, _ = api
    body = {"title": "t", "filename": "1-01", "script": "[1] はい。 // Vâng.\n[2] どうも。 // Cảm ơn.",
            "options": {"slow": False, "srt": False, "worksheet": True, "format": "wav", "bilingual": True, "level": "N5"}}
    data = client.post("/api/v1/dialogue", json=body).json()
    html = Path(data["files"]["worksheet_html"]).read_text(encoding="utf-8")
    assert "Vâng." in html and "Dịch" in html
    tl = json.loads(Path(data["files"]["timeline_json"]).read_text(encoding="utf-8"))
    assert len(tl["sfx"]) == 2  # 2 câu dịch được chèn


def test_lesson_pack_exports_everything(api):
    client, _ = api
    body = {
        "title": "Thuê nhà", "filename": "1-02", "script": "[1] いらっしゃいませ。\n[2] アパートを探{さが}しています。",
        "roles": {"1": {"voice": "3", "name": "不動産屋"}, "2": {"voice": "2", "name": "ミン"}},
        "options": {"format": "wav", "slow": True, "srt": True},
        "vocab": [{"word": "探{さが}す", "reading": "さがす", "meaning": "tìm"}],
        "questions": [{"question": "ミンさんは何を探していますか。", "choices": ["アパート", "仕事"], "answer": 1}],
    }
    data = client.post("/api/v1/lesson", json=body).json()
    f = data["files"]
    for key in ("audio", "slow_audio", "srt", "worksheet_html", "shadowing", "roleplay_1", "roleplay_2", "vocab", "questions"):
        assert Path(f[key]).is_file(), key
    assert Path(f["roleplay_2"]).name == "1-02_dong-vai-ミン.wav"
    html = Path(f["worksheet_html"]).read_text(encoding="utf-8")
    assert "Từ vựng" in html and "Đáp án" in html and "tìm" in html


def test_check_audio_flags_misread_lines(api, monkeypatch):
    client, _ = api
    import core.qc as qc

    heard = iter(["駅の近くにある", "敵の近くにある"])  # câu 2 bị đọc 駅 thành 敵
    monkeypatch.setattr(qc, "transcribe", lambda path: next(heard))
    res = client.post("/api/v1/check-audio", json={"script": "[1] 駅{えき}の近{ちか}くにある。\n[2] 駅{えき}の近{ちか}くにある。"})
    data = res.json()
    assert data["checked"] == 2
    assert [r["id"] for r in data["suspicious"]] == ["L002"]
    assert data["suspicious"][0]["heard"] == "敵の近くにある"


def test_check_audio_reports_missing_whisper(api, monkeypatch):
    client, _ = api
    import core.qc as qc

    def boom(*a, **k):
        raise qc.QCUnavailable("Chưa có gói faster-whisper")

    monkeypatch.setattr(qc, "check_lines", boom)
    res = client.post("/api/v1/check-audio", json={"script": "[1] はい。"})
    assert res.status_code == 501 and "faster-whisper" in res.json()["detail"]
