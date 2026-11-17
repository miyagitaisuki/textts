"""Kiểm thử các tính năng mới của server.py và ai_tools/mcp_server.py (Aivis-only, exam, quản lý nghe)."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from pydub.generators import Sine

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import server  # noqa: E402
from ai_tools import mcp_server  # noqa: E402

client = TestClient(server.app)


def test_mcp_tools_use_aivis_and_include_new_tools():
    names = {t["name"] for t in mcp_server.TOOLS}
    expected = {
        "textts_create_exam",
        "textts_list_outputs",
        "textts_get_output",
        "textts_rename_output",
        "textts_delete_output",
        "textts_update_voice_note",
        "textts_save_character",
        "textts_delete_character",
        "textts_list_readings",
        "textts_add_reading",
    }
    assert expected.issubset(names)
    assert names == set(mcp_server.HANDLERS)
    assert mcp_server.ENGINES == ["aivis"]


@patch("server.synth_cached", new_callable=AsyncMock)
@patch("server.synth_all", new_callable=AsyncMock)
@patch("server.check_aivis_alive", new_callable=AsyncMock)
def test_create_exam_and_outputs_crud(mock_alive, mock_synth_all, mock_synth_cached, tmp_path, monkeypatch):
    mock_alive.return_value = True
    monkeypatch.setattr(server, "output_dir", tmp_path)

    wav = tmp_path / "tone.wav"
    Sine(440).to_audio_segment(duration=300).export(wav, format="wav")
    mock_synth_cached.return_value = wav

    async def fake_synth_all(project, provider, cache_dir):
        for it in project.items:
            if hasattr(it, "audio"):
                it.audio = str(wav)
        return []

    mock_synth_all.side_effect = fake_synth_all

    payload = {
        "title": "JLPT N5 De 1",
        "filename": "de_n5_01",
        "format": "wav",
        "bell": False,
        "mondai": [
            {
                "title": "問題1",
                "instruction": "質問を聞いてください。",
                "questions": [
                    {
                        "intro": "男の人は何を買いますか。",
                        "script": "[1] りんごをください。\n[2] はい。",
                        "question": "男の人は何を買いますか。",
                        "choices": ["りんご", "みかん"],
                        "think_ms": 500,
                        "answer": 1,
                        "explanation": "Người đàn ông mua táo.",
                    }
                ],
            }
        ],
    }
    res = client.post("/api/v1/exam", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["mondai_count"] == 1
    assert data["question_count"] == 1
    assert Path(data["files"]["audio"]).is_file()
    assert Path(data["files"]["worksheet_html"]).is_file()
    assert Path(data["files"]["srt"]).is_file()

    # List outputs
    listed = client.get("/api/v1/outputs").json()
    assert any(it["name"] == "de_n5_01" for it in listed["items"])

    # Get output detail
    detail = client.get("/api/v1/outputs/de_n5_01").json()
    assert detail["name"] == "de_n5_01"
    assert detail["timeline"]["question_count" if False else "duration_ms"] > 0

    # Rename output
    renamed = client.patch("/api/v1/outputs/de_n5_01", json={"new_name": "de_n5_02"}).json()
    assert renamed["name"] == "de_n5_02"

    # Delete output
    deleted = client.delete("/api/v1/outputs/de_n5_02").json()
    assert deleted["deleted"] == "de_n5_02"
    assert not (tmp_path / "de_n5_02").exists()


def test_voice_bank_and_characters_crud(tmp_path, monkeypatch):
    monkeypatch.setenv("TEXTTS_USER_DATA", str(tmp_path))

    res_vb = client.post("/api/v1/voice-bank", json={
        "voice": "1431611904",
        "nickname": "Mai",
        "gender": "nữ",
        "age": 22,
        "favorite": True,
    })
    assert res_vb.status_code == 200
    assert res_vb.json()["item"]["key"] == "aivis:1431611904"

    res_ch = client.post("/api/v1/characters", json={
        "name": "Yui",
        "voice": "1431611904",
        "emotion": "happy",
        "speed": "normal",
        "pitch": 0,
        "description": "nữ sinh",
    })
    assert res_ch.status_code == 200
    assert client.get("/api/v1/characters").json()["items"][0]["name"] == "Yui"

    res_del = client.delete("/api/v1/characters/Yui")
    assert res_del.status_code == 200
    assert client.get("/api/v1/characters").json()["items"] == []
