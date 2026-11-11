"""Kiểm thử cho REST API server (server.py)."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from server import app

client = TestClient(app)


def test_health_endpoint():
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "voicevox_connected" in data
    assert "version" in data


def test_preview_script_endpoint():
    script = "[1] すみません、駅はどこですか。\n[2] あそこです。"
    res = client.post("/api/v1/preview-script", json={"script": script})
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "駅{えき}" in data["annotated_script"]
    assert len(data["items"]) == 2
    assert data["items"][0]["role"] == "1"


def test_preview_script_invalid():
    # Câu sai định dạng
    res = client.post("/api/v1/preview-script", json={"script": "sai định dạng hoàn toàn"})
    # parse_script ném ValueError/ScriptError
    assert res.status_code == 400


@patch("server.list_speakers", new_callable=AsyncMock)
def test_speakers_endpoint_success(mock_list):
    mock_list.return_value = [{"value": "3", "label": "ずんだもん (ノーマル)"}]
    res = client.get("/api/v1/speakers")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert len(data["speakers"]) == 1


@patch("server.list_speakers", new_callable=AsyncMock)
def test_speakers_endpoint_unavailable(mock_list):
    mock_list.side_effect = Exception("Connection refused")
    res = client.get("/api/v1/speakers")
    assert res.status_code == 503
    assert "VOICEVOX Engine" in res.json()["detail"]


@patch("server.synth_all", new_callable=AsyncMock)
@patch("server.check_voicevox_alive", new_callable=AsyncMock)
def test_generate_dialogue_mocked(mock_vv_alive, mock_synth, tmp_path):
    from pydub import AudioSegment
    import server

    mock_vv_alive.return_value = True

    # Giả lập synth_all thành công
    async def fake_synth(project, provider, cache_dir):
        dummy_wav = tmp_path / "dummy.wav"
        AudioSegment.silent(500).export(dummy_wav, format="wav")
        for it in project.items:
            if hasattr(it, "audio"):
                it.audio = str(dummy_wav)
        return []

    mock_synth.side_effect = fake_synth

    payload = {
        "title": "Bai_Test_API",
        "script": "[1] こんにちは。\n[2] おはようございます。",
        "engine": "voicevox",
        "options": {
            "format": "wav",
            "slow": True,
            "srt": True,
            "worksheet": True,
        },
    }

    with patch.object(server, "output_dir", tmp_path):
        res = client.post("/api/v1/dialogue", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True
        assert data["title"] == "Bai_Test_API"
        assert "audio" in data["files"]
        assert "srt" in data["files"]
        assert "slow_audio" in data["files"]
        assert "worksheet_html" in data["files"]
        assert len(data["timeline"]) == 2
        # Không có filename: thư mục riêng mang tên title.
        assert Path(data["files"]["audio"]).parent == tmp_path / "Bai_Test_API"

        # Có filename theo giáo trình: mọi file nằm trong <thư mục xuất>/1-02/ và mang tên 1-02.
        res = client.post("/api/v1/dialogue", json={**payload, "filename": "1-02"})
        data = res.json()
        folder = tmp_path / "1-02"
        assert data["filename"] == "1-02" and Path(data["folder"]) == folder
        for key in ("audio", "srt", "slow_audio", "worksheet_html", "timeline_json"):
            assert Path(data["files"][key]).parent == folder
            assert Path(data["files"][key]).name.startswith("1-02")
        assert data["files"]["audio_url"].endswith("/files/1-02/1-02.wav")


@patch("server.synth_all", new_callable=AsyncMock)
@patch("server.check_aivis_alive", new_callable=AsyncMock)
def test_generate_dialogue_aivis_mocked(mock_aivis_alive, mock_synth, tmp_path):
    from pydub import AudioSegment
    import server

    mock_aivis_alive.return_value = True

    async def fake_synth(project, provider, cache_dir):
        dummy_wav = tmp_path / "dummy.wav"
        AudioSegment.silent(500).export(dummy_wav, format="wav")
        for it in project.items:
            if hasattr(it, "audio"):
                it.audio = str(dummy_wav)
        return []

    mock_synth.side_effect = fake_synth

    payload = {
        "title": "Bai_Test_Aivis",
        "script": "[1] こんにちは。\n[2] おはようございます。",
        "engine": "aivis",
        "options": {"format": "wav"},
    }

    with patch.object(server, "output_dir", tmp_path):
        res = client.post("/api/v1/dialogue", json=payload)
        assert res.status_code == 200
        assert res.json()["ok"] is True


def test_generate_dialogue_invalid_role_play():
    payload = {
        "title": "Bai_Test_Role_Play",
        "script": "[1] こんにちは。\n[2] おはようございます。",
        "engine": "edge",
        "options": {"role_play": "99"},
    }
    res = client.post("/api/v1/dialogue", json=payload)
    assert res.status_code == 400
    assert "Không tìm thấy vai [99]" in res.json()["detail"]


@patch("server.aivis_list_speakers", new_callable=AsyncMock)
def test_speakers_endpoint_aivis_and_edge(mock_aivis_speakers):
    mock_aivis_speakers.return_value = [{"value": "888753760", "label": "jvnv-F1 (ノーマル)"}]
    res_aivis = client.get("/api/v1/speakers?engine=aivis")
    assert res_aivis.status_code == 200
    assert res_aivis.json()["engine"] == "aivis"
    assert len(res_aivis.json()["speakers"]) == 1

    res_edge = client.get("/api/v1/speakers?engine=edge")
    assert res_edge.status_code == 200
    assert res_edge.json()["engine"] == "edge"
    assert len(res_edge.json()["speakers"]) > 0



@patch("server.synth_all", new_callable=AsyncMock)
@patch("server.check_voicevox_alive", new_callable=AsyncMock)
def test_dialogue_stacks_background_layers_from_the_library(mock_vv_alive, mock_synth, tmp_path, monkeypatch):
    from pydub import AudioSegment
    from pydub.generators import Sine
    import server

    mock_vv_alive.return_value = True
    lib = tmp_path / "lib"
    (lib / "my" / "bgm").mkdir(parents=True)
    Sine(300).to_audio_segment(800).export(lib / "my" / "bgm" / "mua.wav", format="wav")
    Sine(500).to_audio_segment(800).export(lib / "my" / "bgm" / "xe co.wav", format="wav")
    monkeypatch.setenv("TEXTTS_SOUND_LIBRARY", str(lib))

    async def fake_synth(project, provider, cache_dir):
        wav = tmp_path / "line.wav"
        AudioSegment.silent(500).export(wav, format="wav")
        for it in project.items:
            if hasattr(it, "audio"):
                it.audio = str(wav)
        return []

    mock_synth.side_effect = fake_synth

    # AI xem thư viện trước
    sounds = client.get("/api/v1/sounds?kind=bgm").json()["items"]
    assert {"mua", "xe co"} <= {s["ref"] for s in sounds}

    payload = {
        "title": "Trời mưa", "filename": "2-01", "script": "[1] 雨ですね。",
        "options": {"format": "wav", "slow": False, "srt": False, "worksheet": False,
                    "bgm": [{"ref": "mua", "db": -20}, {"ref": "xe-co", "db": -28}]},
    }
    with patch.object(server, "output_dir", tmp_path / "out"):
        data = client.post("/api/v1/dialogue", json=payload).json()
        assert [(Path(l["path"]).name, l["db"]) for l in data["bgm"]] == [("mua.wav", -20), ("xe co.wav", -28)]
        tl = json.loads(Path(data["files"]["timeline_json"]).read_text(encoding="utf-8"))
        assert len(tl["bgm"]) == 2

        # Tên không có trong thư viện: báo lỗi kèm gợi ý thay vì bỏ qua
        bad = client.post("/api/v1/dialogue", json={**payload, "options": {**payload["options"], "bgm": "tàu điện"}})
        assert bad.status_code == 400 and "mua" in bad.json()["detail"]


def test_voice_bank_endpoint_ranks_voices_for_a_role(tmp_path, monkeypatch):
    (tmp_path / "voice-bank.json").write_text(json.dumps({"voices": {
        "aivis:1": {"label": "まお", "nickname": "Bé Mao", "gender": "nữ", "age": 8, "styles": ["trẻ con"]},
        "aivis:2": {"label": "ろてじん", "nickname": "Ông Lão", "gender": "nam", "age": 75, "styles": ["trầm"]},
    }}, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setenv("TEXTTS_USER_DATA", str(tmp_path))
    data = client.get("/api/v1/voice-bank", params={"engine": "aivis", "q": "ông già giọng trầm"}).json()
    assert data["items"][0]["voice"] == "2"
    assert len(client.get("/api/v1/voice-bank").json()["items"]) == 2
