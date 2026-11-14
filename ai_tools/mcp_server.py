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
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # thư mục chứa server.py (resources/engine trong bộ cài)
API_URL = (os.environ.get("TEXTTS_API_URL") or "http://127.0.0.1:8000").rstrip("/")
SERVER_NAME = "textts"
SERVER_VERSION = "1.3.0"
SUPPORTED_PROTOCOLS = ("2025-06-18", "2025-03-26", "2024-11-05")
ENGINES = ["voicevox", "aivis", "edge"]

INSTRUCTIONS = """textts tạo bài nghe hội thoại tiếng Nhật (MP3, bản chậm 0.8x, phụ đề SRT, phiếu học tập HTML có furigana).
Quy trình nên dùng:
1. textts_status: xem engine nào đang chạy (VOICEVOX, AivisSpeech; Edge TTS cần Internet).
2. Chọn giọng: gọi textts_find_voices với mô tả từng vai (vd. "bé gái 8 tuổi vui tươi", "ông già giọng trầm")
   để lấy giọng giáo viên đã ghi chú trong Ngân hàng giọng (biệt danh, giới tính, tuổi, chất giọng; ★ là yêu thích).
   Dùng đúng 'voice' và 'engine' trả về; các vai trong một bài phải cùng một engine. Nếu ngân hàng trống
   hoặc không hợp, dùng textts_list_voices để xem toàn bộ giọng của engine.
3. Soạn kịch bản: mỗi câu thoại một dòng, bắt đầu bằng số vai: "[1] こんにちは。" hoặc "1 こんにちは。".
   Chú âm chữ Hán khó bằng 漢字{かな} (ví dụ 面接{めんせつ}). Khoảng lặng thêm: dòng "[pause=1500]".
   Khoảng lặng giữa các câu được chèn tự động, không cần thêm [pause] cho mỗi câu.
4. Bối cảnh & hiệu ứng: khi người dùng nêu bối cảnh (công viên, quán cà phê, trời mưa, nhà ga...) hoặc
   kịch bản có tiếng động (chuông cửa, điện thoại, gõ cửa...), gọi textts_list_sounds (có thể kèm 'query',
   vd. query="tiếng sấm") để đọc mục lục: mỗi âm có mô tả, từ khóa và "dùng tạm cho". Không cần nghe file.
   Không có âm "khớp" thì dùng âm "gần đúng" phù hợp nhất (vd. không có sấm thì dùng mưa) và nói rõ với
   người dùng là đang dùng tạm âm nào.
   - Nhạc/âm nền: đặt 'bgm' của textts_create_audio là danh sách lớp nền hợp bối cảnh
     (ưu tiên âm "thư viện của giáo viên" nếu khớp). Có thể chồng nhiều lớp cùng lúc, ví dụ đường phố
     trời mưa: [{"ref": "mua", "db": -20}, {"ref": "duong-pho", "db": -26}]; lớp phụ nên nhỏ hơn lớp chính.
     Không có âm phù hợp thì bỏ qua lớp đó và báo người dùng.
   - Hiệu ứng: chèn một dòng riêng "[sfx=<ref>]" vào đúng chỗ trong kịch bản (vd. "[sfx=chuong-cua]").
   Chỉ dùng 'ref' có trong danh sách, không tự đặt tên.
5. Đạo diễn để hội thoại tự nhiên (viết thẳng trong kịch bản):
   - Cảm xúc/tốc độ từng câu: [2]{emotion=happy, speed=slow} ...  (neutral|happy|sad|angry|surprised)
   - Hiệu ứng giọng: {fx=phone} qua điện thoại, {fx=whisper} thì thầm, {fx=far} ở xa, {fx=radio} loa thông báo,
     {fx=echo} phòng vang. To/nhỏ: {vol=-6}. Nói chen: {overlap=400} (bắt đầu trước khi câu trước dứt 400 ms).
   - Ngừng trước/sau câu: {pre=300} (lặng 300 ms trước câu, vd. trước câu trả lời ngập ngừng),
     {post=800} (lặng thêm sau câu, vd. sau câu hỏi để học viên kịp nghĩ). Giá trị là ms, số nguyên không âm.
   - Nhịp đọc (chỉ engine aivis): {tempo=1.2} nhấn nhá nhanh hơn, {tempo=0.8} chậm rãi hơn (0.5..2.0).
   - Accent (chỉ engine aivis): {accent=2/0} đặt vị trí accent cho từng cụm của câu. Chỉ dùng khi giáo viên đưa
     sẵn giá trị (lấy từ panel Accent trên giao diện); không tự đoán vì số cụm phải khớp đúng với engine.
   - Ngập ngừng tự nhiên viết thẳng vào lời: えーと、あの…、うーん。 Câu cảm thán ngắn (はい、へえ、そうですか) giúp sống động.
   - Cảnh: dòng [bgm=quan-ca-phe] đổi âm nền từ chỗ đó (nhiều lớp: [bgm=mua+duong-pho@-26], tắt: [bgm=off]).
   - Hiệu ứng: [sfx=chuong-cua] chiếm thời gian riêng; [sfx=dien-thoai-reo, overlay, vol=-6] chồng lên câu kế tiếp.
   - Bản dịch: thêm " // bản dịch tiếng Việt" cuối mỗi câu (dùng cho bản song ngữ và phiếu học tập).
6. Trình độ: đặt level (N5..N1) để chỉnh tốc độ/khoảng nghỉ; textts_levels cho gợi ý viết theo trình độ.
7. Nhân vật cố định của giáo trình: textts_list_characters; dùng roles {"1": {"character": "Minh"}} để mọi bài
   cùng nhân vật giữ nguyên giọng.
8. textts_check_script (tùy chọn): kiểm tra cú pháp và gợi ý furigana trước khi tạo.
9. Tạo: textts_create_audio (một bài nghe) hoặc textts_create_lesson (trọn bộ: bài nghe, bản chậm, shadowing,
   đóng vai, từ vựng, câu hỏi nghe hiểu + đáp án, phiếu in). Khi người dùng muốn "bài học"/"giáo án", dùng lesson
   và tự soạn vocab (5-12 từ) + questions (2-4 câu kiểu JLPT 聴解).
10. Sau khi tạo, gọi textts_check_audio để nghe lại; câu đáng ngờ thì thêm chú âm 漢字{かな} rồi tạo lại."""

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
        "name": "textts_find_voices",
        "description": "Tìm giọng hợp vai trong Ngân hàng giọng của giáo viên (biệt danh, giới tính, tuổi, chất giọng "
        "như vui, buồn, trẻ con, trầm). Trả về 'engine' và 'voice' dùng trong 'roles' của textts_create_audio.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Mô tả vai, vd. 'bé gái 8 tuổi vui tươi', 'nhân viên nam trẻ'"},
                "engine": {"type": "string", "enum": ENGINES, "description": "Bỏ trống để tìm ở mọi engine"},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "textts_list_sounds",
        "description": "Liệt kê âm trong thư viện của textts: nhạc/âm nền (bgm) theo bối cảnh như công viên, "
        "quán cà phê, mưa, và hiệu ứng (sfx) như chuông cửa, điện thoại reo. Gồm gói CC0 của textts và âm "
        "giáo viên tự thêm. Trường 'ref' dùng cho 'bgm' của textts_create_audio hoặc dòng [sfx=<ref>] trong kịch bản.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["bgm", "sfx"], "description": "Bỏ trống để lấy cả hai"},
                "query": {
                    "type": "string",
                    "description": "Âm cần tìm, mô tả bằng lời (vd. 'tiếng sấm', 'quán ăn đông người'). "
                    "Kết quả ghi 'khớp' hoặc 'gần đúng' (dùng tạm được). Bỏ trống để xem cả mục lục.",
                },
            },
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
                "title": {"type": "string", "description": "Tên bài học, in trên phiếu học tập, ví dụ 'Thuê nhà'"},
                "filename": {
                    "type": "string",
                    "description": "Tên file theo giáo trình, đúng số track in trong sách (ví dụ '1-02' cho ♪1-02). "
                    "Luôn đặt khi soạn giáo trình; các file được lưu chung một thư mục riêng mang tên này.",
                },
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
                            "character": {"type": "string", "description": "Tên nhân vật cố định (textts_list_characters)"},
                            "voice": {"type": "string", "description": "Mã giọng từ textts_find_voices / textts_list_voices"},
                            "name": {"type": "string", "description": "Tên nhân vật"},
                            "emotion": {"type": "string", "enum": ["neutral", "happy", "sad", "angry", "surprised"]},
                            "speed": {"type": "string", "enum": ["slow", "normal", "fast"]},
                            "pitch": {"type": "integer", "minimum": -50, "maximum": 50},
                        },

                    },
                },
                "bgm": {
                    "type": "array",
                    "description": "Các lớp nhạc/âm nền phát cùng lúc suốt bài (chồng lên nhau), 'ref' lấy từ "
                    "textts_list_sounds (kind=bgm). Ví dụ trời mưa ngoài phố: "
                    "[{\"ref\": \"mua\", \"db\": -20}, {\"ref\": \"duong-pho\", \"db\": -26}]. Bỏ trống nếu không cần.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "ref": {"type": "string"},
                            "db": {"type": "number", "minimum": -40, "maximum": -6,
                                   "description": "Âm lượng lớp này so với lời thoại; trống = bgm_db"},
                        },
                        "required": ["ref"],
                    },
                },
                "bgm_db": {
                    "type": "number", "minimum": -40, "maximum": -6, "default": -20,
                    "description": "Âm lượng mặc định mỗi lớp nền so với lời thoại (dB); -20 là nền nhẹ, -12 là rõ hơn",
                },
                "level": {"type": "string", "enum": ["N5", "N4", "N3", "N2", "N1"],
                          "description": "Trình độ người học: chỉnh tốc độ đọc và khoảng nghỉ"},
                "bilingual": {"type": "boolean", "default": False,
                              "description": "Đọc bản dịch tiếng Việt (phần sau ' // ' mỗi câu) ngay sau câu đó"},
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


_AUDIO = next(t for t in TOOLS if t["name"] == "textts_create_audio")
TOOLS += [
    {
        "name": "textts_create_lesson",
        "description": "Tạo trọn bộ bài học nghe trong một thư mục: bài nghe chính, bản chậm, phụ đề, shadowing, "
        "bản đóng vai cho từng vai, bài từ vựng (đọc từng từ + nghĩa), câu hỏi nghe hiểu kiểu JLPT và phiếu in có đáp án.",
        "inputSchema": {
            **_AUDIO["inputSchema"],
            "properties": {
                **_AUDIO["inputSchema"]["properties"],
                "vocab": {
                    "type": "array",
                    "description": "Từ vựng chính của bài (5-12 từ)",
                    "items": {"type": "object", "properties": {
                        "word": {"type": "string", "description": "Từ, có thể chú âm 漢字{かな}"},
                        "reading": {"type": "string"}, "meaning": {"type": "string", "description": "Nghĩa tiếng Việt"},
                    }, "required": ["word"]},
                },
                "questions": {
                    "type": "array",
                    "description": "Câu hỏi nghe hiểu tiếng Nhật kiểu JLPT 聴解 (2-4 câu)",
                    "items": {"type": "object", "properties": {
                        "question": {"type": "string"}, "choices": {"type": "array", "items": {"type": "string"}},
                        "answer": {"type": "integer", "description": "Số thứ tự đáp án đúng, bắt đầu từ 1"},
                        "explanation": {"type": "string", "description": "Giải thích bằng tiếng Việt"},
                    }, "required": ["question", "choices", "answer"]},
                },
                "roleplay": {"type": "boolean", "default": True},
                "shadowing": {"type": "boolean", "default": True},
            },
        },
    },
    {
        "name": "textts_check_audio",
        "description": "Nghe lại từng câu đã tạo (nhận dạng giọng nói) và so với kịch bản để tìm câu đọc sai, "
        "thường do chữ Hán đọc nhầm. Dùng cùng script/engine/roles như khi tạo.",
        "inputSchema": {"type": "object", "properties": {
            "script": _AUDIO["inputSchema"]["properties"]["script"],
            "engine": _AUDIO["inputSchema"]["properties"]["engine"],
            "roles": _AUDIO["inputSchema"]["properties"]["roles"],
        }, "required": ["script"], "additionalProperties": False},
    },
    {
        "name": "textts_list_characters",
        "description": "Nhân vật cố định của giáo trình (tên, giọng, cảm xúc, mô tả) để mọi bài dùng cùng nhân vật.",
        "inputSchema": {"type": "object", "properties": {"engine": {"type": "string", "enum": ENGINES}},
                        "additionalProperties": False},
    },
    {
        "name": "textts_assemble",
        "description": "Ghép nhiều đoạn thành MỘT file, ví dụ đề nghe: đoạn speech (đọc chữ bằng giọng chọn), "
        "đoạn audio (file có sẵn trên máy, như chuông hay bài nghe đã tạo) và đoạn pause (khoảng lặng). "
        "Trả về file ghép và thời điểm bắt đầu từng đoạn.",
        "inputSchema": {"type": "object", "properties": {
            "filename": {"type": "string", "description": "Tên file (và thư mục) xuất"},
            "engine": {"type": "string", "enum": ENGINES},
            "voice": {"type": "string", "description": "Giọng mặc định cho các đoạn speech"},
            "format": {"type": "string", "enum": ["mp3", "wav"], "default": "mp3"},
            "segments": {"type": "array", "minItems": 1, "items": {"type": "object", "properties": {
                "type": {"type": "string", "enum": ["speech", "audio", "pause"]},
                "text": {"type": "string", "description": "speech: chữ tiếng Nhật, chú âm 漢字{かな}"},
                "voice": {"type": "string", "description": "speech: giọng riêng cho đoạn này"},
                "path": {"type": "string", "description": "audio: đường dẫn file mp3/wav/ogg/m4a trên máy"},
                "ms": {"type": "integer", "description": "pause: độ dài khoảng lặng (ms)"},
            }, "required": ["type"]}},
        }, "required": ["segments"], "additionalProperties": False},
    },
    {
        "name": "textts_levels",
        "description": "Gợi ý soạn kịch bản theo trình độ JLPT (N5-N1): độ dài câu, ngữ pháp, tốc độ đọc.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
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


def _dialogue_body(args: dict) -> dict:
    script = str(args.get("script") or "").strip()
    if not script:
        raise ToolError("script trống")
    engine = args.get("engine") or "voicevox"
    if engine not in ENGINES:
        raise ToolError(f"engine phải là một trong {', '.join(ENGINES)}")
    body: dict = {
        "title": str(args.get("title") or "hoi_thoai"),
        **({"filename": str(args["filename"])} if args.get("filename") else {}),
        "script": script,
        "engine": engine,
        "options": {
            "format": args.get("format") or "mp3",
            "slow": bool(args.get("slow", True)),
            "srt": bool(args.get("srt", True)),
            "worksheet": bool(args.get("worksheet", True)),
            **({"bgm": _bgm_layers(args["bgm"])} if args.get("bgm") else {}),
            **({"bgm_db": float(args["bgm_db"])} if args.get("bgm_db") is not None else {}),
            **({"level": args["level"]} if args.get("level") else {}),
            **({"bilingual": True} if args.get("bilingual") else {}),
        },
    }
    if args.get("roles"):
        body["roles"] = {str(k): {kk: vv for kk, vv in v.items() if vv is not None} for k, v in args["roles"].items()}
    return body


FILE_LABELS = [
    ("audio", "Âm thanh"),
    ("slow_audio", "Bản chậm 0.8x"),
    ("bilingual", "Bản song ngữ"),
    ("shadowing", "Bản shadowing"),
    ("vocab", "Từ vựng"),
    ("questions", "Câu hỏi nghe hiểu"),
    ("srt", "Phụ đề SRT"),
    ("worksheet_html", "Phiếu học tập HTML"),
]


def _describe(res: dict, args: dict, what: str) -> str:
    files = res.get("files", {})
    lines = [f"Đã tạo {what} '{res.get('title')}': {res.get('line_count')} câu thoại, {res.get('duration_s')} giây. "
             f"Thư mục: {res.get('folder')}"]
    lines += [f"- {label}: {files[key]}" for key, label in FILE_LABELS if files.get(key)]
    lines += [f"- Bản đóng vai ({k.split('_', 1)[1]}): {v}" for k, v in files.items()
              if k.startswith("roleplay_") and not k.endswith("_url")]
    if files.get("credits"):
        lines.append(f"- Ghi nguồn âm thanh (bắt buộc khi chia sẻ): {files['credits']}")
    for layer in res.get("bgm") or []:
        lines.append(f"- Lớp nền: {layer['path']} ({layer['db']} dB)")
    if files.get("audio") and args.get("open_folder"):
        try:
            _open_folder(files["audio"])
        except OSError as exc:
            lines.append(f"(Không mở được thư mục: {exc})")
    return "\n".join(lines)


def tool_create_audio(args: dict) -> str:
    res = call_api("POST", "/api/v1/dialogue", _dialogue_body(args), timeout=900)
    return _describe(res, args, "bài nghe")


def tool_create_lesson(args: dict) -> str:
    body = _dialogue_body(args)
    body["vocab"] = [v for v in args.get("vocab") or [] if isinstance(v, dict) and v.get("word")]
    body["questions"] = [q for q in args.get("questions") or [] if isinstance(q, dict) and q.get("question")]
    body["roleplay"] = bool(args.get("roleplay", True))
    body["shadowing"] = bool(args.get("shadowing", True))
    res = call_api("POST", "/api/v1/lesson", body, timeout=1800)
    return _describe(res, args, f"gói bài học ({res.get('vocab_count', 0)} từ vựng, {res.get('question_count', 0)} câu hỏi)")


def tool_check_audio(args: dict) -> str:
    body = {k: v for k, v in _dialogue_body(args).items() if k in ("script", "engine", "roles")}
    res = call_api("POST", "/api/v1/check-audio", body, timeout=1800)
    if res.get("ok"):
        return f"Đã nghe lại {res.get('checked')} câu: tất cả khớp kịch bản."
    lines = [f"Đã nghe lại {res.get('checked')} câu; {len(res['suspicious'])} câu có thể đọc sai:"]
    for r in res["suspicious"]:
        lines.append(f"- {r['id']} (khớp {int(r['score'] * 100)}%): kịch bản '{r['display']}' — nghe thành '{r['heard']}'")
    lines.append("Gợi ý: thêm chú âm 漢字{かな} cho chữ bị đọc sai (hoặc viết bằng kana) rồi tạo lại.")
    return "\n".join(lines)


def tool_assemble(args: dict) -> str:
    import base64
    segments = []
    for i, seg in enumerate(args.get("segments") or [], 1):
        if not isinstance(seg, dict):
            raise ToolError(f"Đoạn {i}: không hợp lệ")
        item = {k: seg[k] for k in ("type", "text", "voice", "ms") if k in seg}
        if seg.get("type") == "audio":
            path = Path(str(seg.get("path") or "")).expanduser()
            try:
                item["audio_b64"] = base64.b64encode(path.read_bytes()).decode("ascii")
            except OSError as exc:
                raise ToolError(f"Đoạn {i}: không đọc được file '{path}' ({exc})") from None
            item["format"] = path.suffix.lstrip(".").lower() or "mp3"
        segments.append(item)
    body = {k: args[k] for k in ("filename", "engine", "voice", "format") if args.get(k)}
    res = call_api("POST", "/api/v1/assemble", {**body, "segments": segments}, timeout=900)
    files = res.get("files", {})
    return (f"Đã ghép {len(segments)} đoạn thành '{res.get('filename')}', {res.get('duration_s')} giây. "
            f"Thư mục: {res.get('folder')}\n- Âm thanh: {files.get('audio')}\n"
            f"- Thời điểm bắt đầu từng đoạn (ms): {res.get('marks')}")


def tool_list_characters(args: dict) -> str:
    q = f"?engine={args['engine']}" if args.get("engine") else ""
    items = call_api("GET", "/api/v1/characters" + q).get("items", [])
    if not items:
        return "Chưa có nhân vật cố định. Giáo viên tạo trong app (panel Vai → Mẫu / nhân vật giáo trình)."
    return "\n".join(f"- {c['name']} [engine={c.get('engine') or 'bất kỳ'}, voice={c['voice']}, {c['emotion']}, {c['speed']}]"
                     + (f" — {c['description']}" if c.get("description") else "") for c in items)


def tool_levels(_args: dict) -> str:
    items = call_api("GET", "/api/v1/levels").get("items", [])
    return "\n".join(f"- {i['level']}: {i['guide']} (tốc độ ×{i['rate']}, nghỉ đổi người {i['turn_gap_ms']} ms)" for i in items)


def _bgm_layers(value) -> list:
    """Nhận một tên, danh sách tên, hoặc danh sách {ref, db}."""
    items = value if isinstance(value, list) else [value]
    out = []
    for it in items:
        if isinstance(it, str) and it.strip():
            out.append(it.strip())
        elif isinstance(it, dict) and it.get("ref"):
            out.append({"ref": str(it["ref"]), **({"db": float(it["db"])} if it.get("db") is not None else {})})
    return out


def tool_find_voices(args: dict) -> str:
    params = {k: v for k, v in (("engine", args.get("engine")), ("q", args.get("query"))) if v}
    res = call_api("GET", "/api/v1/voice-bank" + (("?" + urllib.parse.urlencode(params)) if params else ""))
    items = res.get("items", [])
    if not items:
        return ("Ngân hàng giọng chưa có giọng phù hợp (giáo viên chưa ghi chú, hoặc không khớp). "
                "Dùng textts_list_voices để xem toàn bộ giọng của engine.")
    lines = []
    for v in items[:15]:
        info = [v.get("gender") or "", f"{v['age']} tuổi" if v.get("age") is not None else "", ", ".join(v.get("styles") or [])]
        name = (v.get("nickname") or v.get("label") or v["voice"]) + (" ★" if v.get("favorite") else "")
        line = f"- engine={v['engine']} voice={v['voice']!r}: {name} ({v.get('label', '')}) — " + "; ".join(i for i in info if i)
        if v.get("description"):
            line += f" — {v['description']}"
        if v.get("why"):
            line += f" [khớp: {', '.join(v['why'])}]"
        lines.append(line)
    return "\n".join(lines)


def tool_list_sounds(args: dict) -> str:
    kind = args.get("kind")
    if kind not in (None, "", "bgm", "sfx"):
        raise ToolError("kind phải là 'bgm' hoặc 'sfx'")
    params = {k: v for k, v in (("kind", kind), ("q", args.get("query"))) if v}
    res = call_api("GET", "/api/v1/sounds" + (("?" + urllib.parse.urlencode(params)) if params else ""))
    items = res.get("items", [])
    if not items:
        if args.get("query"):
            return (f"Không có âm nào khớp hoặc gần với '{args['query']}'. "
                    "Gọi lại không kèm query để xem cả mục lục, hoặc báo người dùng thêm âm vào thư viện.")
        return "Thư viện âm thanh trống."
    lines = []
    for k, title in (("bgm", "Nhạc/âm nền (dùng cho 'bgm')"), ("sfx", "Hiệu ứng (dùng dòng [sfx=<ref>])")):
        group = [it for it in items if it["kind"] == k]
        if not group:
            continue
        lines.append(f"{title}:")
        for it in group:
            extra = [it.get("description") or ""]
            if it.get("tags"):
                extra.append("từ khóa: " + ", ".join(it["tags"]))
            if it.get("substitute_for"):
                extra.append("dùng tạm cho: " + ", ".join(it["substitute_for"]))
            match = f" ({it['match']})" if it.get("match") else ""
            lines.append(f"- ref={it['ref']!r}{match}: {it['name']} — " + "; ".join(e for e in extra if e)
                         + f" [{it['source']}]")
    return "\n".join(lines)


HANDLERS = {
    "textts_status": tool_status,
    "textts_list_sounds": tool_list_sounds,
    "textts_find_voices": tool_find_voices,
    "textts_list_voices": tool_list_voices,
    "textts_check_script": tool_check_script,
    "textts_create_audio": tool_create_audio,
    "textts_create_lesson": tool_create_lesson,
    "textts_check_audio": tool_check_audio,
    "textts_assemble": tool_assemble,
    "textts_list_characters": tool_list_characters,
    "textts_levels": tool_levels,
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
