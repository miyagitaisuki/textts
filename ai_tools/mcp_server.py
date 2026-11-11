"""MCP server (stdio) để Claude Desktop tạo bài nghe hội thoại tiếng Nhật bằng textts.

Chỉ dùng thư viện chuẩn của Python, nên chạy được bằng Python đi kèm bộ cài textts.
Server này gọi REST API của textts (server.py, mặc định http://127.0.0.1:8000); nếu API
chưa chạy, server tự khởi động server.py ở chế độ nền và tắt nó khi Claude Desktop thoát.

Cấu hình trong claude_desktop_config.json (Windows, bản cài textts):

    {
      "mcpServers": {
        "textts": {
          "command": "C:\\\\Users\\\\<tên>\\\\AppData\\\\Local\\\\Programs\\\\textts-gui\\\\resources\\\\python\\\\python.exe",
          "args": ["C:\\\\Users\\\\<tên>\\\\AppData\\\\Local\\\\Programs\\\\textts-gui\\\\resources\\\\engine\\\\ai_tools\\\\mcp_server.py"]
        }
      }
    }

Biến môi trường (tùy chọn): TEXTTS_API_URL (mặc định http://127.0.0.1:8000),
TEXTTS_NO_AUTOSTART=1 để không tự khởi động server.py.

Giao thức: JSON-RPC 2.0, mỗi thông điệp một dòng UTF-8 trên stdin/stdout (MCP stdio transport).
Không được in gì khác ra stdout; log ghi ra stderr.
"""
from __future__ import annotations

import atexit
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # thư mục chứa server.py (resources/engine trong bộ cài)
API_URL = (os.environ.get("TEXTTS_API_URL") or "http://127.0.0.1:8000").rstrip("/")
SERVER_NAME = "textts"
SERVER_VERSION = "1.1.1"
SUPPORTED_PROTOCOLS = ("2025-06-18", "2025-03-26", "2024-11-05")
ENGINES = ["voicevox", "aivis", "edge"]

INSTRUCTIONS = """textts tạo bài nghe hội thoại tiếng Nhật (MP3, bản chậm 0.8x, phụ đề SRT, phiếu học tập HTML có furigana).
Quy trình nên dùng:
1. textts_status: xem engine nào đang chạy (VOICEVOX, AivisSpeech; Edge TTS cần Internet).
2. textts_list_voices: lấy mã giọng của engine đã chọn, chọn giọng hợp với từng vai.
3. Soạn kịch bản: mỗi câu thoại một dòng, bắt đầu bằng số vai: "[1] こんにちは。" hoặc "1 こんにちは。".
   Chú âm chữ Hán khó bằng 漢字{かな} (ví dụ 面接{めんせつ}). Khoảng lặng thêm: dòng "[pause=1500]".
   Khoảng lặng giữa các câu được chèn tự động, không cần thêm [pause] cho mỗi câu.
4. textts_check_script (tùy chọn): kiểm tra cú pháp và gợi ý furigana trước khi tạo.
5. textts_create_audio: tạo file; trả về đường dẫn các file trên máy người dùng."""

TOOLS = [
    {
        "name": "textts_status",
        "description": "Kiểm tra textts API và các engine giọng nói (VOICEVOX, AivisSpeech) có đang chạy không. "
        "Tự khởi động textts API nếu chưa chạy.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "textts_list_voices",
        "description": "Liệt kê các giọng của một engine. Trường 'value' là mã giọng dùng trong 'roles' của "
        "textts_create_audio (VOICEVOX/AivisSpeech: mã style dạng số; Edge: tên giọng như ja-JP-NanamiNeural).",
        "inputSchema": {
            "type": "object",
            "properties": {"engine": {"type": "string", "enum": ENGINES, "default": "voicevox"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "textts_check_script",
        "description": "Kiểm tra cú pháp kịch bản và gợi ý chú âm furigana 漢字{かな} cho chữ Hán. "
        "Trả về kịch bản đã chú âm để rà lại trước khi tạo âm thanh.",
        "inputSchema": {
            "type": "object",
            "properties": {"script": {"type": "string", "description": "Kịch bản, mỗi dòng: [số vai] lời thoại"}},
            "required": ["script"],
            "additionalProperties": False,
        },
    },
    {
        "name": "textts_create_audio",
        "description": "Tạo bài nghe hội thoại tiếng Nhật từ kịch bản: file âm thanh, bản chậm 0.8x, phụ đề SRT "
        "và phiếu học tập HTML có furigana. Trả về đường dẫn các file trên máy người dùng.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Tên bài/tên file, không dấu, ví dụ phong_van_xin_viec"},
                "script": {
                    "type": "string",
                    "description": "Kịch bản tiếng Nhật, mỗi câu thoại một dòng bắt đầu bằng số vai: "
                    "'[1] すみません。'. Chú âm: 漢字{かな}. Khoảng lặng thêm: '[pause=1500]'.",
                },
                "engine": {"type": "string", "enum": ENGINES, "default": "voicevox"},
                "roles": {
                    "type": "object",
                    "description": "Cấu hình từng vai theo số vai ('1', '2', ...). Bỏ trống để dùng giọng mặc định.",
                    "additionalProperties": {
                        "type": "object",
                        "properties": {
                            "voice": {"type": "string", "description": "Mã giọng từ textts_list_voices"},
                            "name": {"type": "string", "description": "Tên nhân vật"},
                            "emotion": {"type": "string", "enum": ["neutral", "happy", "sad", "angry", "surprised"]},
                            "speed": {"type": "string", "enum": ["slow", "normal", "fast"]},
                            "pitch": {"type": "integer", "minimum": -50, "maximum": 50},
                        },
                        "required": ["voice"],
                    },
                },
                "format": {"type": "string", "enum": ["mp3", "wav"], "default": "mp3"},
                "slow": {"type": "boolean", "default": True, "description": "Xuất thêm bản chậm 0.8x"},
                "srt": {"type": "boolean", "default": True, "description": "Xuất phụ đề .srt"},
                "worksheet": {"type": "boolean", "default": True, "description": "Xuất phiếu học tập HTML"},
                "open_folder": {
                    "type": "boolean",
                    "default": False,
                    "description": "Mở thư mục chứa file sau khi tạo (chỉ Windows/macOS)",
                },
            },
            "required": ["title", "script"],
            "additionalProperties": False,
        },
    },
]


class ToolError(Exception):
    """Lỗi trả về cho Claude dưới dạng kết quả công cụ có isError=true."""


def log(msg: str) -> None:
    print(f"[textts-mcp] {msg}", file=sys.stderr, flush=True)


# --- Gọi textts REST API -------------------------------------------------------------------

def api_request(method: str, path: str, body: dict | None = None, timeout: float = 30) -> dict:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        f"{API_URL}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json; charset=utf-8"} if data else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(detail).get("detail", detail)
        except (ValueError, AttributeError):
            pass
        raise ToolError(f"textts API báo lỗi {exc.code}: {detail}") from None
    except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
        raise ConnectionError(str(getattr(exc, "reason", exc))) from None


_server_proc: subprocess.Popen | None = None


def _stop_server() -> None:
    if _server_proc and _server_proc.poll() is None:
        _server_proc.terminate()


def _start_server() -> None:
    """Khởi động server.py (cùng Python với MCP server) và đợi /api/v1/health trả lời."""
    global _server_proc
    parsed = urllib.parse.urlparse(API_URL)
    if parsed.hostname not in ("127.0.0.1", "localhost") or os.environ.get("TEXTTS_NO_AUTOSTART"):
        raise ToolError(f"Không kết nối được textts API tại {API_URL}. Hãy bật API trong app textts.")
    server = ROOT / "server.py"
    if not server.is_file():
        raise ToolError(f"Không tìm thấy {server}. Hãy bật API trong app textts (Engine giọng → Bật API).")
    env = dict(os.environ)
    ffmpeg_dir = ROOT.parent / "ffmpeg"  # bộ cài Windows: resources/ffmpeg
    if ffmpeg_dir.is_dir():
        env["PATH"] = str(ffmpeg_dir) + os.pathsep + env.get("PATH", "")
    log_path = ROOT / "output" / "mcp-api.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log(f"Khởi động textts API: {server} (log: {log_path})")
    with open(log_path, "ab") as log_file:
        _server_proc = subprocess.Popen(
            [sys.executable, str(server), "--host", parsed.hostname, "--port", str(parsed.port or 8000)],
            cwd=str(ROOT),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    atexit.register(_stop_server)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if _server_proc.poll() is not None:
            raise ToolError(f"textts API dừng ngay khi khởi động (mã {_server_proc.returncode}). Xem log: {log_path}")
        try:
            api_request("GET", "/api/v1/health", timeout=3)
            return
        except ConnectionError:
            time.sleep(1)
    raise ToolError(f"textts API chưa trả lời sau 60 giây. Xem log: {log_path}")


def call_api(method: str, path: str, body: dict | None = None, timeout: float = 30) -> dict:
    """Gọi API; nếu chưa có server thì tự khởi động rồi gọi lại một lần."""
    try:
        return api_request(method, path, body, timeout)
    except ConnectionError:
        _start_server()
        try:
            return api_request(method, path, body, timeout)
        except ConnectionError as exc:
            raise ToolError(f"Không kết nối được textts API tại {API_URL}: {exc}") from None


# --- Công cụ -------------------------------------------------------------------------------

def tool_status(_args: dict) -> str:
    h = call_api("GET", "/api/v1/health")
    yes = lambda ok: "đang chạy" if ok else "chưa bật (bật trong app textts: Engine giọng)"  # noqa: E731
    return (
        f"textts API {h.get('version', '')} tại {API_URL}: đang chạy\n"
        f"- VOICEVOX ({h.get('voicevox_url')}): {yes(h.get('voicevox_connected'))}\n"
        f"- AivisSpeech ({h.get('aivis_url')}): {yes(h.get('aivis_connected'))}\n"
        f"- Edge TTS: dùng được khi có Internet"
    )


def tool_list_voices(args: dict) -> str:
    engine = args.get("engine") or "voicevox"
    if engine not in ENGINES:
        raise ToolError(f"engine phải là một trong {', '.join(ENGINES)}")
    res = call_api("GET", f"/api/v1/speakers?engine={engine}")
    speakers = res.get("speakers") or []
    if not speakers:
        return f"Engine {engine} không có giọng nào."
    lines = [f"{len(speakers)} giọng của {engine} (value = mã giọng cho 'roles'):"]
    lines += [f"- {s.get('value')}: {s.get('label')}" for s in speakers]
    return "\n".join(lines)


def tool_check_script(args: dict) -> str:
    script = str(args.get("script") or "").strip()
    if not script:
        raise ToolError("script trống")
    res = call_api("POST", "/api/v1/preview-script", {"script": script})
    return "Kịch bản hợp lệ. Bản có gợi ý furigana (rà lại tên riêng và từ nhiều cách đọc):\n\n" + res.get(
        "annotated_script", ""
    )


def _open_folder(path: str) -> None:
    folder = str(Path(path).parent)
    if sys.platform == "win32":
        os.startfile(folder)  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", folder])


def tool_create_audio(args: dict) -> str:
    script = str(args.get("script") or "").strip()
    if not script:
        raise ToolError("script trống")
    engine = args.get("engine") or "voicevox"
    if engine not in ENGINES:
        raise ToolError(f"engine phải là một trong {', '.join(ENGINES)}")
    body: dict = {
        "title": str(args.get("title") or "hoi_thoai"),
        "script": script,
        "engine": engine,
        "options": {
            "format": args.get("format") or "mp3",
            "slow": bool(args.get("slow", True)),
            "srt": bool(args.get("srt", True)),
            "worksheet": bool(args.get("worksheet", True)),
        },
    }
    if args.get("roles"):
        body["roles"] = {str(k): {kk: vv for kk, vv in v.items() if vv is not None} for k, v in args["roles"].items()}
    res = call_api("POST", "/api/v1/dialogue", body, timeout=900)
    files = res.get("files", {})
    labels = [
        ("audio", "Âm thanh"),
        ("slow_audio", "Bản chậm 0.8x"),
        ("srt", "Phụ đề SRT"),
        ("worksheet", "Phiếu học tập HTML"),
    ]
    lines = [f"Đã tạo bài nghe '{res.get('title')}': {res.get('line_count')} câu thoại, {res.get('duration_s')} giây."]
    lines += [f"- {label}: {files[key]}" for key, label in labels if files.get(key)]
    if files.get("audio") and args.get("open_folder"):
        try:
            _open_folder(files["audio"])
        except OSError as exc:
            lines.append(f"(Không mở được thư mục: {exc})")
    return "\n".join(lines)


HANDLERS = {
    "textts_status": tool_status,
    "textts_list_voices": tool_list_voices,
    "textts_check_script": tool_check_script,
    "textts_create_audio": tool_create_audio,
}


# --- JSON-RPC / MCP ------------------------------------------------------------------------

def _result(msg_id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _error(msg_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


def handle(msg: dict) -> dict | None:
    """Xử lý một thông điệp JSON-RPC. Trả về phản hồi, hoặc None với thông báo (notification)."""
    method = msg.get("method")
    msg_id = msg.get("id")
    is_request = "id" in msg
    params = msg.get("params") or {}

    if method == "initialize":
        requested = params.get("protocolVersion")
        version = requested if requested in SUPPORTED_PROTOCOLS else SUPPORTED_PROTOCOLS[0]
        return _result(msg_id, {
            "protocolVersion": version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            "instructions": INSTRUCTIONS,
        })
    if method == "ping":
        return _result(msg_id, {})
    if method == "tools/list":
        return _result(msg_id, {"tools": TOOLS})
    if method == "tools/call":
        name = params.get("name")
        handler = HANDLERS.get(name)
        if handler is None:
            return _error(msg_id, -32602, f"Công cụ không tồn tại: {name}")
        try:
            text = handler(params.get("arguments") or {})
            return _result(msg_id, {"content": [{"type": "text", "text": text}], "isError": False})
        except ToolError as exc:
            return _result(msg_id, {"content": [{"type": "text", "text": str(exc)}], "isError": True})
        except Exception as exc:  # noqa: BLE001 - báo lỗi cho Claude thay vì làm sập server
            log(f"Lỗi khi chạy {name}: {exc!r}")
            return _result(msg_id, {"content": [{"type": "text", "text": f"Lỗi: {exc}"}], "isError": True})
    if not is_request:
        return None  # notifications/initialized, notifications/cancelled, ...
    return _error(msg_id, -32601, f"Không hỗ trợ: {method}")


def serve(stdin=None, stdout=None) -> None:
    stdin = stdin or sys.stdin.buffer
    stdout = stdout or sys.stdout.buffer
    for raw in stdin:
        line = raw.decode("utf-8", errors="replace").strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            reply = _error(None, -32700, "JSON không hợp lệ")
        else:
            reply = handle(msg) if isinstance(msg, dict) else _error(None, -32600, "Yêu cầu không hợp lệ")
        if reply is not None:
            stdout.write((json.dumps(reply, ensure_ascii=False) + "\n").encode("utf-8"))
            stdout.flush()


if __name__ == "__main__":
    serve()
