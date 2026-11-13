"""MCP server cho Claude Desktop (ai_tools/mcp_server.py): giao thức JSON-RPC và các công cụ."""
import io
import json
import os
import socket
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ai_tools"))
import mcp_server  # noqa: E402


def call(method, params=None, msg_id=1):
    return mcp_server.handle({"jsonrpc": "2.0", "id": msg_id, "method": method, "params": params or {}})


def test_initialize_and_list_tools():
    init = call("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t"}})
    assert init["result"]["protocolVersion"] == "2025-06-18"
    assert init["result"]["capabilities"] == {"tools": {"listChanged": False}}
    assert "漢字{かな}" in init["result"]["instructions"]
    assert call("initialize", {"protocolVersion": "1999-01-01"})["result"]["protocolVersion"] == "2025-06-18"
    names = [t["name"] for t in call("tools/list")["result"]["tools"]]
    assert names == ["textts_status", "textts_list_voices", "textts_find_voices", "textts_list_sounds",
                     "textts_check_script", "textts_create_audio", "textts_create_lesson", "textts_check_audio",
                     "textts_list_characters", "textts_assemble", "textts_levels"]
    assert mcp_server.handle({"jsonrpc": "2.0", "method": "notifications/initialized"}) is None
    assert call("nope")["error"]["code"] == -32601


def test_create_audio_sends_request_and_lists_files(monkeypatch):
    seen = {}

    def fake(method, path, body=None, timeout=30):
        seen.update(method=method, path=path, body=body, timeout=timeout)
        return {"ok": True, "title": "bai1", "duration_s": 12.5, "line_count": 2,
                "files": {"audio": "C:/out/bai1.mp3", "slow_audio": "C:/out/bai1_slow.mp3", "srt": "C:/out/bai1.srt"}}

    monkeypatch.setattr(mcp_server, "api_request", fake)
    res = call("tools/call", {"name": "textts_create_audio", "arguments": {
        "title": "bai1", "script": "[1] はい。\n[2] どうぞ。", "engine": "aivis",
        "roles": {"1": {"voice": "888753760", "name": "学生"}}, "worksheet": False}})["result"]
    assert res["isError"] is False
    text = res["content"][0]["text"]
    assert "2 câu thoại, 12.5 giây" in text and "C:/out/bai1_slow.mp3" in text
    assert seen["path"] == "/api/v1/dialogue" and seen["timeout"] == 900
    assert seen["body"]["engine"] == "aivis"
    assert seen["body"]["roles"] == {"1": {"voice": "888753760", "name": "学生"}}
    assert seen["body"]["options"] == {"format": "mp3", "slow": True, "srt": True, "worksheet": False}


def test_tool_errors_are_reported_not_raised(monkeypatch):
    def fake(method, path, body=None, timeout=30):
        raise mcp_server.ToolError("textts API báo lỗi 503: AivisSpeech chưa bật")

    monkeypatch.setattr(mcp_server, "api_request", fake)
    res = call("tools/call", {"name": "textts_list_voices", "arguments": {"engine": "aivis"}})["result"]
    assert res["isError"] is True and "AivisSpeech chưa bật" in res["content"][0]["text"]
    bad = call("tools/call", {"name": "textts_create_audio", "arguments": {"title": "x", "script": " "}})["result"]
    assert bad["isError"] is True and "script trống" in bad["content"][0]["text"]
    assert call("tools/call", {"name": "missing"})["error"]["code"] == -32602


def test_serve_reads_and_writes_utf8_lines():
    out = io.BytesIO()
    lines = [json.dumps({"jsonrpc": "2.0", "id": 7, "method": "ping"}), "", "not json"]
    mcp_server.serve(io.BytesIO(("\n".join(lines) + "\n").encode("utf-8")), out)
    replies = [json.loads(x) for x in out.getvalue().decode("utf-8").splitlines()]
    assert replies[0] == {"jsonrpc": "2.0", "id": 7, "result": {}}
    assert replies[1]["error"]["code"] == -32700


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_stdio_end_to_end_starts_api(tmp_path):
    """Chạy MCP server như Claude Desktop: tự khởi động server.py rồi gọi công cụ thật."""
    port = _free_port()
    env = {**os.environ, "TEXTTS_API_URL": f"http://127.0.0.1:{port}", "TEXTTS_OUTPUT_DIR": str(tmp_path)}
    script = Path(__file__).resolve().parent.parent / "ai_tools" / "mcp_server.py"
    msgs = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05"}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "textts_status", "arguments": {}}},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
         "params": {"name": "textts_check_script", "arguments": {"script": "[1] 駅はどこですか。"}}},
    ]
    proc = subprocess.run([sys.executable, str(script)], input="\n".join(json.dumps(m) for m in msgs) + "\n",
                          capture_output=True, text=True, encoding="utf-8", env=env, timeout=120)
    replies = {r["id"]: r for r in map(json.loads, proc.stdout.splitlines())}
    assert replies[1]["result"]["serverInfo"]["name"] == "textts"
    status = replies[2]["result"]
    assert status["isError"] is False, status
    assert f"127.0.0.1:{port}: đang chạy" in status["content"][0]["text"]
    check = replies[3]["result"]
    assert check["isError"] is False, check
    assert "駅{えき}" in check["content"][0]["text"]


def test_create_lesson_and_check_audio(monkeypatch):
    seen = []

    def fake(method, path, body=None, timeout=30):
        seen.append((path, body))
        if path == "/api/v1/check-audio":
            return {"ok": False, "checked": 2, "suspicious": [
                {"id": "L002", "score": 0.89, "display": "駅の近く", "heard": "敵の近く"}]}
        return {"ok": True, "title": "Thuê nhà", "duration_s": 30, "line_count": 4, "folder": "C:/out/1-02",
                "vocab_count": 1, "question_count": 1,
                "files": {"audio": "C:/out/1-02/1-02.mp3", "vocab": "C:/out/1-02/1-02_tu-vung.mp3",
                          "roleplay_2": "C:/out/1-02/1-02_dong-vai-ミン.mp3"}}

    monkeypatch.setattr(mcp_server, "api_request", fake)
    res = call("tools/call", {"name": "textts_create_lesson", "arguments": {
        "title": "Thuê nhà", "filename": "1-02", "script": "[1]{fx=phone} もしもし。 // A lô.", "level": "N4",
        "roles": {"2": {"character": "Minh"}},
        "vocab": [{"word": "探{さが}す", "meaning": "tìm"}, {"meaning": "thiếu từ"}],
        "questions": [{"question": "何を探していますか。", "choices": ["アパート", "仕事"], "answer": 1}]}})["result"]
    text = res["content"][0]["text"]
    assert "Từ vựng: C:/out/1-02/1-02_tu-vung.mp3" in text and "Bản đóng vai (2)" in text
    path, body = seen[0]
    assert path == "/api/v1/lesson"
    assert body["options"]["level"] == "N4" and body["roles"] == {"2": {"character": "Minh"}}
    assert len(body["vocab"]) == 1 and body["questions"][0]["answer"] == 1

    res = call("tools/call", {"name": "textts_check_audio", "arguments": {"script": "[1] 駅の近く。"}})["result"]
    assert "L002" in res["content"][0]["text"] and "敵の近く" in res["content"][0]["text"]


def test_assemble_encodes_local_audio_and_reports_marks(monkeypatch, tmp_path):
    seen = {}

    def fake(method, path, body=None, timeout=30):
        seen.update(path=path, body=body)
        return {"ok": True, "filename": "de1", "folder": "C:/out/de1", "duration_s": 9.5,
                "files": {"audio": "C:/out/de1/de1.mp3"}, "marks": [0, 1500]}

    chime = tmp_path / "chime.mp3"
    chime.write_bytes(b"ID3fake")
    monkeypatch.setattr(mcp_server, "api_request", fake)
    res = call("tools/call", {"name": "textts_assemble", "arguments": {
        "filename": "de1", "engine": "aivis", "segments": [
            {"type": "audio", "path": str(chime)}, {"type": "speech", "text": "一番です。"},
            {"type": "pause", "ms": 2000}]}})["result"]
    assert res["isError"] is False and "C:/out/de1/de1.mp3" in res["content"][0]["text"]
    segs = seen["body"]["segments"]
    assert seen["path"] == "/api/v1/assemble" and seen["body"]["engine"] == "aivis"
    assert segs[0] == {"type": "audio", "audio_b64": "SUQzZmFrZQ==", "format": "mp3"}
    assert segs[1] == {"type": "speech", "text": "一番です。"} and segs[2] == {"type": "pause", "ms": 2000}

    bad = call("tools/call", {"name": "textts_assemble", "arguments": {
        "segments": [{"type": "audio", "path": str(tmp_path / "none.mp3")}]}})["result"]
    assert bad["isError"] is True and "không đọc được file" in bad["content"][0]["text"]
