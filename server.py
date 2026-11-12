"""FastAPI REST API server cho textts.

Cung cấp API để AI (ChatGPT, Claude, AI agents, scripts) tạo âm thanh hội thoại tiếng Nhật
bằng VOICEVOX (hoặc Edge-TTS), xuất trọn gói tài liệu học tập (MP3/WAV, bản chậm 0.8x,
phụ đề .srt, phiếu Furigana HTML) và kiểm tra cách đọc Furigana.
"""
from __future__ import annotations

import asyncio
import os
import re
import urllib.parse
from pathlib import Path
from typing import Any, Literal

import aiohttp
from fastapi import FastAPI, HTTPException, Request
from pydub import AudioSegment
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from core.audio import add_background, loudness_normalize, time_stretch
from core.appdata import output_root
from core.characters import find_character, list_characters
from core.levels import GUIDE, LEVELS, timing_for
from core.render import build_items_for, finish, used_sound_paths
from core import qc
from core.voicebank import list_voices as bank_voices, search_voices
from core.sounds import SoundNotFound, catalog_text, credits_for, find_sound, list_sounds, ref_of, search_sounds
from core.builder import build, practice_items, to_srt
from core.models import Config, LineItem, Project, Role, SfxItem, Timing, load_config
from core.normalize import annotate, reading
from core.parser import parse_script, to_tts_text
from core.paths import sfx_path
from core.readings import load_readings
from core.worksheet import worksheet_html
from providers.base import SynthRequest, TTSProvider
from providers.edge import VOICES as EDGE_VOICES, EdgeProvider
from providers.voicevox import VoicevoxProvider, list_speakers
from providers.aivis import AivisProvider, list_speakers as aivis_list_speakers
from tts import PROVIDERS, add_translations, cache_key, synth_all, synth_cached, write_audio, write_timeline

ROOT = Path(__file__).resolve().parent
# Không ghi vào thư mục cài đặt (bị xóa khi cập nhật). App truyền thư mục xuất người dùng chọn qua TEXTTS_OUTPUT_DIR.
DEFAULT_OUTPUT_DIR = Path.home() / "Documents" / "textts"
DEFAULT_CACHE_DIR = ROOT / "cache"
VOICEVOX_DEFAULT_URL = "http://127.0.0.1:50021"
AIVIS_DEFAULT_URL = "http://127.0.0.1:10101"

app = FastAPI(
    title="textts TTS API",
    description="REST API cho AI sinh giọng nói hội thoại tiếng Nhật (VOICEVOX, AivisSpeech, Edge-TTS), phụ đề và phiếu bài tập Furigana.",
    version="1.2.0",
)

# Cho phép CORS để các client web / local AI tool có thể gọi
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Đảm bảo thư mục output tồn tại và mount static files để tải trực tiếp
# Thứ tự: biến môi trường (app truyền khi tự bật server) → thư mục xuất đã chọn trong app → Documents/textts.
output_dir = Path(os.environ.get("TEXTTS_OUTPUT_DIR") or output_root() or DEFAULT_OUTPUT_DIR)
output_dir.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(output_dir)), name="files")


# --- Models ---
class RoleInput(BaseModel):
    voice: str | None = Field(
        None, description="Mã giọng (VOICEVOX/AivisSpeech: số style; Edge: tên giọng). Bỏ trống nếu dùng 'character'."
    )
    character: str | None = Field(
        None, description="Tên nhân vật cố định của giáo trình (GET /api/v1/characters), vd. 'Minh'. "
        "Lấy giọng, cảm xúc, tốc độ, cao độ của nhân vật; các trường ghi kèm sẽ đè lên."
    )
    name: str = Field("", description="Tên vai, ví dụ 'Giáo viên', 'Học sinh'")
    emotion: Literal["neutral", "happy", "sad", "angry", "surprised"] | None = None
    speed: Literal["slow", "normal", "fast"] | None = None
    pitch: int | None = Field(None, ge=-50, le=50, description="Độ lệch cao độ Hz")
    gain_db: float = Field(0.0, ge=-30.0, le=12.0, description="Độ lệch âm lượng dB")


class BgmLayer(BaseModel):
    ref: str = Field(..., description="Tên/mã âm nền trong thư viện, ví dụ 'mua'")
    db: float | None = Field(None, ge=-40, le=-6, description="Âm lượng lớp này (dB); trống = bgm_db")


class DialogueOptions(BaseModel):
    format: Literal["mp3", "wav"] = "mp3"
    lufs: float | None = Field(-16.0, description="Độ to chuẩn hóa LUFS (null để tắt)")
    slow: bool = Field(True, description="Xuất thêm bản đọc chậm 0.8x")
    srt: bool = Field(True, description="Xuất file phụ đề .srt")
    worksheet: bool = Field(True, description="Xuất phiếu học tập HTML có Furigana <ruby>")
    role_play: str | None = Field(None, description="Mã vai luyện nói (các vai khác bị tắt tiếng)")
    shadow: bool = Field(False, description="Tạo bản shadowing (chèn khoảng lặng sau mỗi câu)")
    shadow_gap_ms: int = Field(1500, description="Khoảng lặng nghỉ trong bản shadowing")
    bgm: str | list[str | BgmLayer] | None = Field(
        None,
        description="Nhạc/âm nền suốt bài, lấy từ thư viện âm thanh (GET /api/v1/sounds?kind=bgm). "
        "Một tên ('cong-vien') hoặc danh sách để chồng nhiều lớp cùng lúc, mỗi lớp chỉnh âm lượng riêng: "
        "[{\"ref\": \"mua\", \"db\": -20}, {\"ref\": \"duong-pho\", \"db\": -26}]. "
        "Muốn đổi nền giữa bài theo cảnh thì dùng dòng [bgm=...] trong kịch bản.",
    )
    bgm_db: float = Field(-20.0, ge=-40, le=-6, description="Âm lượng mặc định của mỗi lớp nền so với lời thoại (dB)")
    level: Literal["N5", "N4", "N3", "N2", "N1"] | None = Field(
        None, description="Trình độ người học: chỉnh tốc độ đọc và khoảng nghỉ (N5 chậm nhất, N1 gần tự nhiên)"
    )
    bilingual: bool = Field(
        False, description="Bản song ngữ: đọc bản dịch tiếng Việt (phần sau '//' của mỗi câu) ngay sau câu đó. Cần Internet (Edge)."
    )
    translation_voice: str = Field("vi-VN-HoaiMyNeural", description="Giọng Edge đọc bản dịch (vi-VN-HoaiMyNeural / vi-VN-NamMinhNeural)")


class DialogueRequest(BaseModel):
    title: str = Field("hoi_thoai", description="Tiêu đề bài học (in trên phiếu học tập)")
    filename: str | None = Field(
        None,
        description="Tên file theo giáo trình, ví dụ '1-02' (số track ghi trong sách). "
        "Mọi file của lần xuất nằm trong thư mục riêng <thư mục xuất>/<filename>/. Bỏ trống thì dùng title.",
    )
    script: str = Field(..., description="Kịch bản tiếng Nhật. Mỗi dòng bắt đầu bằng vai: [1] ... hoặc 1 ...")
    engine: Literal["voicevox", "edge", "aivis"] = Field("voicevox", description="Engine TTS sử dụng (voicevox, aivis, edge)")
    roles: dict[str, RoleInput] | None = Field(
        None, description="Cấu hình vai tùy chọn (nếu để trống sẽ dùng cấu hình mặc định trong roles.yaml)"
    )
    options: DialogueOptions = Field(default_factory=DialogueOptions)


class VocabItem(BaseModel):
    word: str = Field(..., description="Từ tiếng Nhật, có thể chú âm 漢字{かな}")
    reading: str = Field("", description="Cách đọc kana (in trên phiếu)")
    meaning: str = Field("", description="Nghĩa tiếng Việt")


class QuestionItem(BaseModel):
    question: str = Field(..., description="Câu hỏi tiếng Nhật (đọc thành tiếng trong bài nghe câu hỏi)")
    choices: list[str] = Field(default_factory=list, description="Các lựa chọn (đọc kèm số 1, 2, 3...)")
    answer: int | None = Field(None, description="Số thứ tự đáp án đúng (1-based), in ở trang đáp án")
    explanation: str = Field("", description="Giải thích đáp án (tiếng Việt)")


class LessonRequest(DialogueRequest):
    vocab: list[VocabItem] = Field(default_factory=list, description="Từ vựng: đọc từng từ (2 lần) + nghĩa tiếng Việt")
    questions: list[QuestionItem] = Field(default_factory=list, description="Câu hỏi nghe hiểu kiểu JLPT 聴解")
    roleplay: bool = Field(True, description="Xuất bản đóng vai cho từng vai (tắt tiếng vai đó)")
    shadowing: bool = Field(True, description="Xuất bản shadowing")


class CheckAudioRequest(BaseModel):
    script: str
    engine: Literal["voicevox", "edge", "aivis"] = "voicevox"
    roles: dict[str, RoleInput] | None = None
    threshold: float = Field(0.9, ge=0.5, le=1.0, description="Độ khớp tối thiểu (0-1) để coi là đọc đúng")


class PreviewRequest(BaseModel):
    script: str = Field(..., description="Kịch bản tiếng Nhật cần phân tích và kiểm tra Furigana")


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "_", name).strip(" ._-")
    return cleaned or "hoi_thoai"


async def check_voicevox_alive(url: str | None = None) -> bool:
    target = (url or os.environ.get("VOICEVOX_URL") or VOICEVOX_DEFAULT_URL).rstrip("/")
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=2.0)) as session:
            async with session.get(f"{target}/version") as r:
                return r.status == 200
    except Exception:
        return False


async def check_aivis_alive(url: str | None = None) -> bool:
    target = (url or os.environ.get("AIVIS_URL") or AIVIS_DEFAULT_URL).rstrip("/")
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=2.0)) as session:
            async with session.get(f"{target}/version") as r:
                return r.status == 200
    except Exception:
        return False


# --- Endpoints ---
@app.get("/api/v1/health", summary="Kiểm tra trạng thái hệ thống, VOICEVOX và AivisSpeech")
async def health_check():
    vv_url = (os.environ.get("VOICEVOX_URL") or VOICEVOX_DEFAULT_URL).rstrip("/")
    vv_ok = await check_voicevox_alive(vv_url)
    aivis_url = (os.environ.get("AIVIS_URL") or AIVIS_DEFAULT_URL).rstrip("/")
    aivis_ok = await check_aivis_alive(aivis_url)
    return {
        "status": "ok",
        "voicevox_connected": vv_ok,
        "voicevox_url": vv_url,
        "aivis_connected": aivis_ok,
        "aivis_url": aivis_url,
        "cache_dir": str(DEFAULT_CACHE_DIR),
        "version": "1.2.0",
    }


@app.get("/api/v1/speakers", summary="Liệt kê danh sách giọng và phong cách nhân vật (VOICEVOX, Aivis, Edge)")
async def get_speakers(engine: Literal["voicevox", "aivis", "edge"] = "voicevox"):
    if engine == "edge":
        return {"ok": True, "engine": "edge", "speakers": [{"value": v, "label": v} for v in EDGE_VOICES]}
    elif engine == "aivis":
        url = (os.environ.get("AIVIS_URL") or AIVIS_DEFAULT_URL).rstrip("/")
        try:
            speakers = await aivis_list_speakers(base_url=url, only_normal=True)
            return {"ok": True, "engine": "aivis", "speakers": speakers}
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Không kết nối được tới AivisSpeech Engine tại {url}. Hãy chắc chắn rằng AivisSpeech đã được khởi động. Chi tiết: {exc}",
            )
    else:
        vv_url = (os.environ.get("VOICEVOX_URL") or VOICEVOX_DEFAULT_URL).rstrip("/")
        try:
            speakers = await list_speakers(base_url=vv_url)
            return {"ok": True, "engine": "voicevox", "speakers": speakers}
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Không kết nối được tới VOICEVOX Engine tại {vv_url}. Hãy chắc chắn rằng VOICEVOX đã được khởi động. Chi tiết: {exc}",
            )


@app.get("/api/v1/sounds", summary="Mục lục âm thanh: nhạc/âm nền (bgm) và hiệu ứng (sfx), tìm theo nghĩa")
async def sounds(kind: Literal["sfx", "bgm"] | None = None, q: str | None = None):
    """Mục lục để AI chọn âm mà không cần nghe: tên, mô tả, từ khóa, "dùng tạm cho".

    Có `q` (vd. "tiếng sấm") thì trả kết quả xếp theo độ phù hợp; mỗi kết quả có `match`:
    "khớp" hoặc "gần đúng" (âm gần giống dùng tạm được, vd. không có sấm thì dùng mưa).
    Dùng `ref` cho options.bgm hoặc dòng [sfx=<ref>] trong kịch bản.
    """
    items = search_sounds(q, kind) if q else list_sounds(kind)

    def view(it: dict) -> dict:
        out = {
            "ref": ref_of(it),
            "kind": it["kind"],
            "name": it["name"],
            "description": it.get("description", ""),
            "tags": it.get("tags", []),
            "substitute_for": it.get("related", []),
            "category": it["category"],
            "source": (it.get("credit") or "thư viện của giáo viên") if it["source"] == "mine" else "gói textts (CC0)",
            "duration_s": it["duration"],
        }
        if "match" in it:
            out["match"] = it["match"]
        return out

    return {"ok": True, "query": q, "items": [view(it) for it in items]}


@app.get("/api/v1/voice-bank", summary="Ngân hàng giọng: ghi chú của giáo viên (biệt danh, giới tính, tuổi, chất giọng)")
async def voice_bank(engine: Literal["voicevox", "aivis", "edge"] | None = None, q: str | None = None):
    """Giọng giáo viên đã ghi chú trong app, để AI chọn giọng hợp vai.

    `q` mô tả vai (vd. "bé gái 8 tuổi vui tươi", "ông già giọng trầm") → kết quả xếp theo độ hợp,
    kèm `why`. Dùng `voice` làm mã giọng trong roles (đúng `engine`). Giọng bị ẩn không được trả về.
    """
    items = search_voices(q, engine) if q else bank_voices(engine)
    return {"ok": True, "query": q, "items": items}


@app.get("/api/v1/sounds/catalog", summary="Mục lục thư viện âm thanh dạng Markdown (cho AI đọc)")
async def sounds_catalog():
    from fastapi.responses import PlainTextResponse

    return PlainTextResponse(catalog_text(), media_type="text/markdown; charset=utf-8")


@app.post("/api/v1/preview-script", summary="Phân tích kịch bản và gợi ý Furigana cho chữ Hán")
async def preview_script(req: PreviewRequest):
    readings_file = ROOT / "readings.yaml"
    readings_dict = load_readings(readings_file) if readings_file.is_file() else {}

    try:
        items = parse_script(req.script, readings=readings_dict)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Lỗi cú pháp kịch bản: {exc}")

    result_items = []
    annotated_lines = []
    for it in items:
        if it.get("type") == "line":
            orig = it.get("display", "")
            try:
                ann = annotate(orig)
                rd = reading(orig)
            except Exception:
                ann = orig
                rd = orig
            it["annotated"] = ann
            it["reading"] = rd
            annotated_lines.append(f"[{it['role']}] {ann}")
            result_items.append(it)
        elif it.get("type") == "pause":
            annotated_lines.append(f"[pause={it.get('ms', 500)}]")
            result_items.append(it)
        elif it.get("type") == "sfx":
            annotated_lines.append(f"[sfx={it.get('path', '')}]")
            result_items.append(it)

    return {
        "ok": True,
        "annotated_script": "\n".join(annotated_lines),
        "items": result_items,
    }


DEFAULT_VOICES = {"voicevox": ("3", "2"), "aivis": ("888753760", "888753770"), "edge": ("ja-JP-KeitaNeural", "ja-JP-NanamiNeural")}


def _default_voice(engine: str, role_id: str) -> str:
    first, second = DEFAULT_VOICES.get(engine, DEFAULT_VOICES["edge"])
    return first if role_id == "1" else second


def _build_roles(req) -> dict[str, Role]:
    """Vai từ yêu cầu: nhân vật cố định của giáo trình (character), giọng ghi trực tiếp, hoặc mặc định."""
    if req.roles:
        roles: dict[str, Role] = {}
        for k, v in req.roles.items():
            base: dict = {"voice": None, "emotion": "neutral", "speed": "normal", "pitch": 0}
            name = v.name
            if v.character:
                ch = find_character(v.character, req.engine)
                if not ch:
                    known = ", ".join(c["name"] for c in list_characters(req.engine)) or "chưa có"
                    raise HTTPException(status_code=400, detail=f"Không có nhân vật '{v.character}' cho engine {req.engine} (có: {known})")
                base.update({kk: ch[kk] for kk in ("voice", "emotion", "speed", "pitch")})
                name = name or ch["name"]
            for kk in ("voice", "emotion", "speed", "pitch"):
                if getattr(v, kk) is not None:
                    base[kk] = getattr(v, kk)
            base["voice"] = base["voice"] or _default_voice(req.engine, k)
            roles[k] = Role(name=name, gain_db=v.gain_db, **base)
        return roles
    roles = load_config(ROOT / "roles.yaml").roles
    if req.engine != "edge":
        roles = {k: (r if r.voice.isdigit() else r.model_copy(update={"voice": _default_voice(req.engine, k)})) for k, r in roles.items()}
    return roles


async def _provider_for(engine: str):
    if engine not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Engine không hỗ trợ: {engine}")
    provider = PROVIDERS[engine]()
    if engine == "voicevox" and not await check_voicevox_alive(getattr(provider, "base_url", None)):
        raise HTTPException(status_code=503, detail="VOICEVOX Engine chưa chạy. Hãy khởi động ứng dụng VOICEVOX trước khi gọi API.")
    if engine == "aivis" and not await check_aivis_alive(getattr(provider, "base_url", None)):
        raise HTTPException(status_code=503, detail="AivisSpeech Engine chưa chạy. Hãy khởi động ứng dụng AivisSpeech trước khi gọi API.")
    return provider


async def _prepare(req) -> tuple[Project, list[dict]]:
    """Phân tích kịch bản, dựng project, tổng hợp mọi câu (có cache). Trả về (project, build_items)."""
    roles = _build_roles(req)
    readings_file = ROOT / "readings.yaml"
    readings_dict = load_readings(readings_file) if readings_file.is_file() else {}
    try:
        raw_items = parse_script(req.script, readings=readings_dict)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Lỗi cú pháp kịch bản: {exc}")
    for it in raw_items:  # vai chưa khai báo: tạo với giọng mặc định
        if it.get("type") == "line" and it["role"] not in roles:
            roles[it["role"]] = Role(voice=_default_voice(req.engine, it["role"]), name=f"Vai {it['role']}")
    level = getattr(getattr(req, "options", None), "level", None)
    timing, _ = timing_for(level, Timing().model_dump())
    project = Project(
        title=getattr(req, "title", ""), engine=req.engine, timing=Timing(**timing), roles=roles,
        items=[{k: v for k, v in it.items() if k != "text"} for it in raw_items],
    )
    role_play = getattr(getattr(req, "options", None), "role_play", None)
    if role_play and role_play not in project.roles:  # báo lỗi trước khi tốn công tổng hợp
        raise HTTPException(status_code=400, detail=f"Không tìm thấy vai [{role_play}] trong project (các vai có sẵn: {', '.join(project.roles)})")
    provider = await _provider_for(req.engine)
    errors = await synth_all(project, provider, DEFAULT_CACHE_DIR)
    if errors:
        raise HTTPException(status_code=500, detail={"message": "Lỗi khi tổng hợp một số câu", "errors": errors})
    try:
        build_items = build_items_for(project, ROOT)
    except SoundNotFound as exc:
        raise HTTPException(status_code=400, detail=f"Âm nền của cảnh: {exc}") from None
    return project, build_items


async def _add_translations(project: Project, build_items: list[dict], voice: str) -> list[dict]:
    """Chèn bản dịch tiếng Việt (đọc bằng Edge) ngay sau mỗi câu có '// bản dịch'."""
    try:
        return await add_translations(project, build_items, voice, DEFAULT_CACHE_DIR)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=f"Bản song ngữ: {exc}") from None
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Không đọc được bản dịch qua Edge TTS (cần Internet): {exc}") from None


def _bgm_layers(options: DialogueOptions) -> list[dict]:
    raw = options.bgm if isinstance(options.bgm, list) else ([options.bgm] if options.bgm else [])
    layers = []
    for layer in raw:
        ref, db = (layer, None) if isinstance(layer, str) else (layer.ref, layer.db)
        try:
            path = find_sound(ref, "bgm")
        except SoundNotFound as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None
        layers.append({"path": str(path), "db": options.bgm_db if db is None else db})
    return layers


def _render(project: Project, build_items: list[dict], options: DialogueOptions, bgm_layers: list[dict], *,
            practice_role: str | None = None, shadow_gap: int | None = None):
    """Ghép một phiên bản của bài (chính / đóng vai / shadowing), áp trình độ, nền, LUFS. Trả về (audio, placed, markers)."""
    gains = {k: r.gain_db for k, r in project.roles.items()}
    timing = project.timing.model_dump()
    _, rate = timing_for(options.level, timing)
    markers: list[dict] = []
    audio, placed = build(build_items, timing, role_gains=gains, markers=markers)
    if practice_role or shadow_gap is not None:
        markers = []
        audio, placed = build(practice_items(build_items, placed, practice_role=practice_role, shadow_gap_ms=shadow_gap),
                              timing, role_gains=gains, markers=markers)
    if rate != 1.0:  # tốc độ theo trình độ: co giãn lời thoại, dời mốc thời gian tương ứng
        audio = time_stretch(audio, rate)
        placed = [{**p, "start_ms": round(p["start_ms"] / rate), "end_ms": round(p["end_ms"] / rate)} for p in placed]
        markers = [{**m, "start_ms": round(m["start_ms"] / rate), **({"end_ms": round(m["end_ms"] / rate)} if "end_ms" in m else {})}
                   for m in markers]
    audio = finish(audio, markers, bgm_layers)
    if options.lufs is not None:
        audio = loudness_normalize(audio, options.lufs)
    return audio, placed, markers


class _Exporter:
    """Ghi file vào thư mục riêng của bài và gom đường dẫn/URL trả về."""

    def __init__(self, base_name: str, request: Request, fmt: str):
        self.base = base_name
        self.dir = output_dir / base_name
        self.dir.mkdir(parents=True, exist_ok=True)
        self.prefix = f"{str(request.base_url).rstrip('/')}/files/{urllib.parse.quote(base_name)}/"
        self.fmt = fmt
        self.files: dict[str, Any] = {}

    def _add(self, key: str, path: Path) -> None:
        self.files[key] = str(path)
        self.files[f"{key}_url"] = self.prefix + urllib.parse.quote(path.name)

    def audio(self, key: str, suffix: str, audio) -> Path:
        path = self.dir / f"{self.base}{suffix}.{self.fmt}"
        write_audio(audio, path, self.fmt)
        self._add(key, path)
        return path

    def text(self, key: str, name: str, content: str) -> Path:
        path = self.dir / name
        path.write_text(content, encoding="utf-8")
        self._add(key, path)
        return path


def _scaled(placed: list[dict], rate: float) -> list[dict]:
    return [{**it, "start_ms": round(it["start_ms"] / rate), "end_ms": round(it["end_ms"] / rate)} for it in placed]


def _export_main(ex: _Exporter, project: Project, options: DialogueOptions, audio, placed, markers, bgm_layers,
                 build_items, *, worksheet_extra: dict | None = None) -> list[str]:
    ex.audio("audio", "", audio)
    timeline = ex.dir / f"{ex.base}.timeline.json"
    write_timeline(audio, placed, timeline, markers=markers, bgm=bgm_layers)
    ex._add("timeline_json", timeline)
    ex.files["timeline"] = ex.files["timeline_json"]
    credit_lines = credits_for(used_sound_paths(markers, bgm_layers))
    if credit_lines:  # âm có giấy phép yêu cầu ghi công (vd. CC BY)
        ex.text("credits", f"{ex.base}.credits.txt", "Âm thanh sử dụng:\n" + "\n".join(credit_lines) + "\n")
    if options.srt:
        ex.text("srt", f"{ex.base}.srt", to_srt(placed))
    if options.slow:
        ex.audio("slow_audio", "_slow", time_stretch(audio, 0.8))
        ex.files["slow_url"] = ex.files.pop("slow_audio_url")
        if options.srt:
            ex.text("slow_srt", f"{ex.base}_slow.srt", to_srt(_scaled(placed, 0.8)))
    if options.worksheet:
        html_content = worksheet_html(
            project.title, [it.model_dump() for it in project.items],
            roles={k: {"name": r.name} for k, r in project.roles.items()}, credits=credit_lines, **(worksheet_extra or {}),
        )
        ex.text("worksheet_html", f"{ex.base}.html", html_content)
        ex.files["worksheet_url"] = ex.files.pop("worksheet_html_url")
    return credit_lines


def _result(req, project, ex: _Exporter, audio, placed, bgm_layers, credit_lines, **extra) -> dict:
    return {
        "ok": True,
        "title": req.title,
        "filename": ex.base,
        "bgm": bgm_layers,
        "credits": credit_lines,
        "folder": str(ex.dir),
        "duration_s": round(len(audio) / 1000, 2),
        "line_count": len([it for it in project.items if isinstance(it, LineItem)]),
        "files": ex.files,
        "timeline": [
            {"id": it["id"], "role": it["role"], "start_ms": it["start_ms"], "end_ms": it["end_ms"], "text": it.get("plain", "")}
            for it in placed
        ],
        **extra,
    }


@app.post("/api/v1/dialogue", summary="Sinh âm thanh hội thoại trọn gói cho bài học")
async def generate_dialogue(req: DialogueRequest, request: Request):
    project, build_items = await _prepare(req)
    if req.options.bilingual:
        build_items = await _add_translations(project, build_items, req.options.translation_voice)
    bgm_layers = _bgm_layers(req.options)
    audio, placed, markers = _render(
        project, build_items, req.options, bgm_layers, practice_role=req.options.role_play,
        shadow_gap=req.options.shadow_gap_ms if req.options.shadow else None,
    )
    ex = _Exporter(sanitize_filename(req.filename or req.title), request, req.options.format)
    credit_lines = _export_main(ex, project, req.options, audio, placed, markers, bgm_layers, build_items)
    return _result(req, project, ex, audio, placed, bgm_layers, credit_lines)


async def _speak_list(texts: list[str], engine: str, voice: str, gap_ms: int = 900):
    """Đọc lần lượt các đoạn tiếng Nhật bằng một giọng (từ vựng, câu hỏi), có khoảng nghỉ giữa các đoạn."""
    from pydub import AudioSegment as _A

    provider = await _provider_for(engine)
    paths = await asyncio.gather(*(synth_cached(provider, SynthRequest(text=to_tts_text(t), voice=voice), DEFAULT_CACHE_DIR) for t in texts))
    return [_A.from_file(p) for p in paths]


@app.post("/api/v1/lesson", summary="Gói bài học trọn bộ: bài nghe, bản chậm, shadowing, đóng vai, từ vựng, câu hỏi, phiếu")
async def generate_lesson(req: LessonRequest, request: Request):
    """Từ một kịch bản (+ từ vựng, câu hỏi do AI soạn) xuất cả bộ tài liệu nghe vào một thư mục:

    - <tên>.mp3 (+ _slow, .srt, .timeline.json), <tên>_shadowing.mp3, <tên>_dong-vai-<vai>.mp3 cho từng vai
    - <tên>_tu-vung.mp3: mỗi từ đọc 2 lần, kèm nghĩa tiếng Việt (Edge, nếu có Internet)
    - <tên>_cau-hoi.mp3: câu hỏi + các lựa chọn đọc kèm số (kiểu JLPT 聴解)
    - <tên>.html: phiếu có hội thoại (furigana, bản dịch), từ vựng, câu hỏi và trang đáp án
    """
    from pydub import AudioSegment as _A

    project, build_items = await _prepare(req)
    bgm_layers = _bgm_layers(req.options)
    ex = _Exporter(sanitize_filename(req.filename or req.title), request, req.options.format)
    audio, placed, markers = _render(project, build_items, req.options, bgm_layers)
    credit_lines = _export_main(ex, project, req.options, audio, placed, markers, bgm_layers, build_items,
                                worksheet_extra={"vocab": [v.model_dump() for v in req.vocab],
                                                 "questions": [q.model_dump() for q in req.questions]})
    if req.options.bilingual:
        bi_items = await _add_translations(project, build_items, req.options.translation_voice)
        a, _, _ = _render(project, bi_items, req.options, bgm_layers)
        ex.audio("bilingual", "_song-ngu", a)
    if req.shadowing:
        a, _, _ = _render(project, build_items, req.options, bgm_layers, shadow_gap=req.options.shadow_gap_ms)
        ex.audio("shadowing", "_shadowing", a)
    if req.roleplay:
        for role_id, role in project.roles.items():
            if not any(isinstance(it, LineItem) and it.role == role_id for it in project.items):
                continue
            a, _, _ = _render(project, build_items, req.options, bgm_layers, practice_role=role_id)
            suffix = sanitize_filename(role.name or role_id).replace(" ", "-")
            ex.audio(f"roleplay_{role_id}", f"_dong-vai-{suffix}", a)

    narrator = next(iter(project.roles.values())).voice
    if req.vocab:
        words = await _speak_list([v.word for v in req.vocab], req.engine, narrator)
        meanings: list = [None] * len(req.vocab)
        if any(v.meaning for v in req.vocab):
            try:
                edge = PROVIDERS["edge"]()
                ps = await asyncio.gather(*(synth_cached(edge, SynthRequest(text=v.meaning, voice=req.options.translation_voice), DEFAULT_CACHE_DIR)
                                           for v in req.vocab if v.meaning))
                it_ps = iter(ps)
                meanings = [_A.from_file(next(it_ps)) if v.meaning else None for v in req.vocab]
            except Exception:  # noqa: BLE001 - không có Internet: chỉ đọc tiếng Nhật
                meanings = [None] * len(req.vocab)
        track = _A.silent(1500)
        for w, m in zip(words, meanings):
            track += w + _A.silent(1200) + w + _A.silent(700)
            if m is not None:
                track += m + _A.silent(1200)
        ex.audio("vocab", "_tu-vung", limit_and_norm(track + _A.silent(1500), req.options.lufs))
    if req.questions:
        track = _A.silent(1500)
        for i, q in enumerate(req.questions, 1):
            parts = await _speak_list([f"{i}番。{q.question}", *[f"{j}、{c}" for j, c in enumerate(q.choices, 1)]], req.engine, narrator)
            track += parts[0] + _A.silent(1500)
            for p in parts[1:]:
                track += p + _A.silent(900)
            track += _A.silent(4000)  # thời gian chọn đáp án
        ex.audio("questions", "_cau-hoi", limit_and_norm(track + _A.silent(1500), req.options.lufs))
    return _result(req, project, ex, audio, placed, bgm_layers, credit_lines,
                   vocab_count=len(req.vocab), question_count=len(req.questions))


def limit_and_norm(audio, lufs):
    return loudness_normalize(audio, lufs) if lufs is not None else audio


class AssembleSegment(BaseModel):
    type: Literal["speech", "audio", "pause"] = Field(..., description="speech: đọc chữ; audio: file có sẵn; pause: khoảng lặng")
    text: str = Field("", description="speech: chữ tiếng Nhật, chú âm 漢字{かな}")
    voice: str | None = Field(None, description="speech: mã giọng; trống thì dùng giọng của yêu cầu")
    audio_b64: str = Field("", description="audio: nội dung file mp3/wav mã hóa base64")
    format: Literal["mp3", "wav", "ogg", "m4a"] = Field("mp3", description="audio: định dạng file")
    ms: int = Field(0, ge=0, le=600_000, description="pause: độ dài khoảng lặng (ms)")


class AssembleRequest(BaseModel):
    filename: str = Field("ghep_am_thanh", description="Tên file (và thư mục) xuất")
    engine: Literal["voicevox", "edge", "aivis"] = "voicevox"
    voice: str | None = Field(None, description="Giọng đọc mặc định cho các đoạn speech (trống: giọng dẫn mặc định)")
    segments: list[AssembleSegment] = Field(..., min_length=1, max_length=2000)
    format: Literal["mp3", "wav"] = "mp3"
    lufs: float | None = Field(-16.0, description="Chuẩn hóa độ to từng đoạn về cùng mức LUFS (null để tắt)")


@app.post("/api/v1/assemble", summary="Ghép nhiều đoạn (lời đọc, file có sẵn, khoảng lặng) thành một file, ví dụ đề nghe")
async def assemble(req: AssembleRequest, request: Request):
    """Ghép theo thứ tự: đoạn speech được đọc bằng engine (có cache), đoạn audio là file gửi kèm (base64),
    đoạn pause là khoảng lặng. Mỗi đoạn có tiếng được chuẩn hóa độ to để cả bài đều nhau.
    Trả về `files.audio_url` và `marks` (thời điểm bắt đầu của từng đoạn, ms)."""
    import base64
    import binascii
    import io

    voice = req.voice or _default_voice(req.engine, "1")
    speech = [s for s in req.segments if s.type == "speech" and s.text.strip()]
    provider = await _provider_for(req.engine) if speech else None
    paths = await asyncio.gather(*(
        synth_cached(provider, SynthRequest(text=to_tts_text(s.text.strip()), voice=s.voice or voice), DEFAULT_CACHE_DIR)
        for s in speech))
    spoken = dict(zip(map(id, speech), paths))
    track = AudioSegment.empty()
    marks = []
    for i, s in enumerate(req.segments):
        marks.append(len(track))
        if s.type == "pause":
            track += AudioSegment.silent(s.ms)
            continue
        if s.type == "speech":
            if id(s) not in spoken:
                continue
            seg = AudioSegment.from_file(spoken[id(s)])
        else:
            try:
                seg = AudioSegment.from_file(io.BytesIO(base64.b64decode(s.audio_b64, validate=True)), format=s.format)
            except (binascii.Error, ValueError, IndexError) as exc:
                raise HTTPException(status_code=400, detail=f"Đoạn {i + 1}: không đọc được file âm thanh ({exc})")
            except Exception as exc:  # pydub/ffmpeg báo lỗi giải mã
                raise HTTPException(status_code=400, detail=f"Đoạn {i + 1}: file âm thanh hỏng hoặc sai định dạng ({exc})")
        track += limit_and_norm(seg, req.lufs)
    if not len(track):
        raise HTTPException(status_code=400, detail="Không có đoạn nào có âm thanh")
    ex = _Exporter(sanitize_filename(req.filename), request, req.format)
    ex.audio("audio", "", track)
    return {"ok": True, "filename": ex.base, "folder": str(ex.dir), "duration_s": round(len(track) / 1000, 2),
            "files": ex.files, "marks": marks}


@app.post("/api/v1/check-audio", summary="Tự kiểm tra phát âm: nghe lại từng câu và so với kịch bản")
async def check_audio(req: CheckAudioRequest):
    """Đọc lại từng câu bằng nhận dạng giọng nói (Whisper) và so cách đọc với kịch bản.

    Câu `ok: false` thường do chữ Hán bị đọc sai: thêm chú âm 漢字{かな} rồi tạo lại.
    """
    project, _ = await _prepare(req)
    lines = [{"id": it.id, "text": it.tts_text, "display": it.display, "audio": it.audio}
             for it in project.items if isinstance(it, LineItem) and it.audio]
    try:
        results = await asyncio.to_thread(qc.check_lines, lines, req.threshold)
    except qc.QCUnavailable as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from None
    bad = [r for r in results if not r["ok"]]
    return {"ok": not bad, "checked": len(results), "suspicious": bad, "results": results}


@app.get("/api/v1/characters", summary="Nhân vật cố định của giáo trình (giọng + tính cách) để dùng lại giữa các bài")
async def characters(engine: Literal["voicevox", "aivis", "edge"] | None = None):
    return {"ok": True, "items": list_characters(engine)}


@app.get("/api/v1/levels", summary="Gợi ý soạn kịch bản và nhịp đọc theo trình độ JLPT")
async def levels():
    return {"ok": True, "items": [{"level": k, "guide": GUIDE[k], **v} for k, v in LEVELS.items()]}


def main():
    import argparse
    import sys
    import uvicorn

    # Khi bị GUI chạy qua pipe, stdout dùng bảng mã Windows (cp1252/cp932) và in emoji sẽ làm server thoát ngay.
    for stream in (sys.stdout, sys.stderr):
        if stream is not None and hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Khởi chạy textts REST API Server")
    parser.add_argument("--host", default="127.0.0.1", help="Địa chỉ host (mặc định: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Cổng chạy server (mặc định: 8000)")
    args = parser.parse_args()

    print(f"🚀 textts API Server đang chạy tại: http://{args.host}:{args.port}")
    print(f"📖 Tài liệu Swagger UI: http://{args.host}:{args.port}/docs")
    uvicorn.run("server:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
