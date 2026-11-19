"""Unit tests cho ai_tools/ptc_client.py của textts."""
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ai_tools"))

import mcp_server  # noqa: E402
import ptc_client  # noqa: E402


def test_create_audio_returns_structured_json_and_enforces_aivis(monkeypatch):
    seen = {}

    def fake_call_api(method, path, body=None, timeout=30):
        seen.update(method=method, path=path, body=body, timeout=timeout)
        return {
            "ok": True,
            "title": "cau1",
            "duration_s": 5.2,
            "files": {"audio": "C:/out/cau1.mp3"},
            "qc": {"checked": 2, "suspicious": []},
        }

    monkeypatch.setattr(mcp_server, "call_api", fake_call_api)
    client = ptc_client.TexttsClient()

    with pytest.raises(ptc_client.ToolError):
        client.create_audio(title="x", script="[1] はい。", engine="voicevox")

    res = client.create_audio(
        title="cau1",
        script="[1] はい。\n[2] どうぞ。",
        roles={"1": {"voice": "38453056"}},
        level="N5",
    )
    assert res["ok"] is True
    assert res["files"]["audio"] == "C:/out/cau1.mp3"
    assert seen["path"] == "/api/v1/dialogue"
    assert seen["body"]["engine"] == "aivis"
    assert seen["body"]["options"]["auto_qc"] is True


def test_check_script_and_check_audio(monkeypatch):
    def fake_call_api(method, path, body=None, timeout=30):
        if path == "/api/v1/preview-script":
            return {"annotated_script": "[1] 駅{えき}です。", "issues": []}
        if path == "/api/v1/check-audio":
            return {"ok": False, "checked": 1, "suspicious": [{"id": "L1", "score": 0.6}]}
        raise AssertionError(path)

    monkeypatch.setattr(mcp_server, "call_api", fake_call_api)
    client = ptc_client.TexttsClient()
    s = client.check_script("[1] 駅です。", level="N5")
    assert s["issues"] == []
    a = client.check_audio(script="[1] 駅です。", roles={"1": {"voice": "38453056"}})
    assert a["ok"] is False
    assert a["suspicious"][0]["score"] == 0.6
