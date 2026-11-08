"""Kiểm thử cho REST API server (server.py)."""
from __future__ import annotations

import json
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
