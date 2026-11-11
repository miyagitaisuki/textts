import json

from core.voicebank import list_voices, search_voices


def _bank(tmp_path):
    p = tmp_path / "voice-bank.json"
    p.write_text(json.dumps({"voices": {
        "aivis:1": {"label": "まお", "nickname": "Bé Mao", "gender": "nữ", "age": 8, "styles": ["trẻ con", "vui tươi"],
                    "description": "bé gái tinh nghịch", "favorite": True},
        "aivis:2": {"label": "ろてじん", "nickname": "Ông Lão", "gender": "nam", "age": 75, "styles": ["trầm", "chậm rãi"]},
        "aivis:3": {"label": "コハク", "nickname": "Chị Kohaku", "gender": "nữ", "age": 24, "styles": ["ấm áp", "nhân viên"]},
        "voicevox:3": {"label": "ずんだもん", "gender": "nữ", "age": 10, "styles": ["trẻ con"], "hidden": True},
    }}, ensure_ascii=False), encoding="utf-8")
    return p


def test_hidden_voices_are_not_offered(tmp_path):
    p = _bank(tmp_path)
    assert [v["voice"] for v in list_voices(path=p)] == ["1", "2", "3"]


def test_finds_voice_by_role_description(tmp_path):
    p = _bank(tmp_path)
    assert search_voices("bé gái 8 tuổi vui tươi", "aivis", p)[0]["nickname"] == "Bé Mao"
    assert search_voices("ông già giọng trầm", "aivis", p)[0]["nickname"] == "Ông Lão"
    assert search_voices("nhân viên nữ 25 tuổi", "aivis", p)[0]["nickname"] == "Chị Kohaku"
    assert search_voices("tre con", "aivis", p)[0]["nickname"] == "Bé Mao"  # gõ không dấu
    # sai giới tính bị đẩy xuống / loại
    assert all(r["gender"] != "nam" for r in search_voices("cô gái trẻ", "aivis", p)[:2])
