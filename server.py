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
from core.voicebank import list_voices as bank_voices, search_voices
from core.sounds import SoundNotFound, catalog_text, credits_for, find_sound, list_sounds, ref_of, search_sounds
from core.builder import build, practice_items, to_srt
from core.models import Config, LineItem, Project, Role, SfxItem, Timing, load_config
from core.normalize import annotate, reading
from core.parser import parse_script
from core.paths import sfx_path
from core.readings import load_readings
from core.worksheet import worksheet_html
from providers.base import TTSProvider
from providers.edge import VOICES as EDGE_VOICES, EdgeProvider
from providers.voicevox import VoicevoxProvider, list_speakers
from providers.aivis import AivisProvider, list_speakers as aivis_list_speakers
from tts import PROVIDERS, cache_key, synth_all, write_audio, write_timeline

ROOT = Path(__file__).resolve().parent
# Không ghi vào thư mục cài đặt (bị xóa khi cập nhật). App truyền thư mục xuất người dùng chọn qua TEXTTS_OUTPUT_DIR.
DEFAULT_OUTPUT_DIR = Path.home() / "Documents" / "textts"
DEFAULT_CACHE_DIR = ROOT / "cache"
VOICEVOX_DEFAULT_URL = "http://127.0.0.1:50021"
AIVIS_DEFAULT_URL = "http://127.0.0.1:10101"

app = FastAPI(
    title="textts TTS API",
    description="REST API cho AI sinh giọng nói hội thoại tiếng Nhật (VOICEVOX, AivisSpeech, Edge-TTS), phụ đề và phiếu bài tập Furigana.",
    version="1.1.2",
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
    voice: str = Field(..., description="Mã nhân vật VOICEVOX (ví dụ '3' cho Zundamon) hoặc tên giọng Edge")
    name: str = Field("", description="Tên vai, ví dụ 'Giáo viên', 'Học sinh'")
    emotion: Literal["neutral", "happy", "sad", "angry", "surprised"] = "neutral"
    speed: Literal["slow", "normal", "fast"] = "normal"
    pitch: int = Field(0, ge=-50, le=50, description="Độ lệch cao độ Hz")
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
        description="Nhạc/âm nền theo bối cảnh, lấy từ thư viện âm thanh (GET /api/v1/sounds?kind=bgm). "
        "Một tên ('cong-vien') hoặc danh sách để chồng nhiều lớp cùng lúc, mỗi lớp chỉnh âm lượng riêng: "
        "[{\"ref\": \"mua\", \"db\": -20}, {\"ref\": \"duong-pho\", \"db\": -26}].",
    )
    bgm_db: float = Field(-20.0, ge=-40, le=-6, description="Âm lượng mặc định của mỗi lớp nền so với lời thoại (dB)")


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
        "version": "1.1.2",
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


@app.post("/api/v1/dialogue", summary="Sinh âm thanh hội thoại trọn gói cho bài học")
async def generate_dialogue(req: DialogueRequest, request: Request):
    # 1. Chuẩn bị roles
    if req.roles:
        roles_dict = {
            k: Role(
                voice=v.voice,
                name=v.name,
                emotion=v.emotion,
                speed=v.speed,
                pitch=v.pitch,
                gain_db=v.gain_db,
            )
            for k, v in req.roles.items()
        }
    else:
        cfg = load_config(ROOT / "roles.yaml")
        roles_dict = cfg.roles
        if req.engine == "voicevox":
            # Gán giọng mặc định kiểu số cho vai nếu roles.yaml dùng giọng Edge
            for role_id, r in roles_dict.items():
                if not r.voice.isdigit():
                    roles_dict[role_id] = r.model_copy(update={"voice": "3" if role_id == "1" else "2"})
        elif req.engine == "aivis":
            # Gán style ID mặc định JVNV (Style-BERT-VITS2) nếu roles.yaml dùng giọng Edge
            for role_id, r in roles_dict.items():
                if not r.voice.isdigit():
                    roles_dict[role_id] = r.model_copy(update={"voice": "888753760" if role_id == "1" else "888753770"})

    # 2. Phân tích kịch bản
    readings_file = ROOT / "readings.yaml"
    readings_dict = load_readings(readings_file) if readings_file.is_file() else {}
    try:
        raw_items = parse_script(req.script, readings=readings_dict)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Lỗi cú pháp kịch bản: {exc}")

    # Đảm bảo mọi vai trong kịch bản đều có trong roles_dict
    for it in raw_items:
        if it.get("type") == "line" and it.get("role") not in roles_dict:
            # Tự động khởi tạo vai nếu chưa khai báo
            default_voice = "ja-JP-NanamiNeural"
            if req.engine == "voicevox":
                default_voice = "3" if it["role"] == "1" else "2"
            elif req.engine == "aivis":
                default_voice = "888753760" if it["role"] == "1" else "888753770"
            roles_dict[it["role"]] = Role(
                voice=default_voice,
                name=f"Vai {it['role']}",
                emotion="neutral",
                speed="normal",
                pitch=0,
                gain_db=0.0,
            )

    clean_items = [{k: v for k, v in it.items() if k != "text"} for it in raw_items]

    # 3. Tạo Project
    project = Project(
        title=req.title,
        engine=req.engine,
        timing=Timing(),
        roles=roles_dict,
        items=clean_items,
    )

    # Kiểm tra vai luyện nói nếu có
    if req.options.role_play and req.options.role_play not in project.roles:
        raise HTTPException(
            status_code=400,
            detail=f"Không tìm thấy vai [{req.options.role_play}] trong project (các vai có sẵn: {', '.join(project.roles)})",
        )

    # 4. Kiểm tra provider
    if req.engine not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Engine không hỗ trợ: {req.engine}")

    provider = PROVIDERS[req.engine]()
    if req.engine == "voicevox":
        vv_ok = await check_voicevox_alive(getattr(provider, "base_url", None))
        if not vv_ok:
            raise HTTPException(
                status_code=503,
                detail="VOICEVOX Engine chưa chạy. Hãy khởi động ứng dụng VOICEVOX trước khi gọi API.",
            )
    elif req.engine == "aivis":
        aivis_ok = await check_aivis_alive(getattr(provider, "base_url", None))
        if not aivis_ok:
            raise HTTPException(
                status_code=503,
                detail="AivisSpeech Engine chưa chạy. Hãy khởi động ứng dụng AivisSpeech trước khi gọi API.",
            )

    # 5. Tổng hợp âm thanh song song có cache
    cache_dir = DEFAULT_CACHE_DIR
    errors = await synth_all(project, provider, cache_dir)
    if errors:
        raise HTTPException(
            status_code=500,
            detail={"message": "Lỗi khi tổng hợp một số câu", "errors": errors},
        )

    # 6. Ghép nối âm thanh
    build_items = [
        {**it.model_dump(), "path": str(sfx_path(it.path, ROOT))}
        if isinstance(it, SfxItem)
        else it.model_dump()
        for it in project.items
    ]
    gains = {k: r.gain_db for k, r in project.roles.items()}
    timing = project.timing.model_dump()
    audio, placed = build(build_items, timing, role_gains=gains)

    # Tùy chọn role_play hoặc shadow
    if req.options.role_play or req.options.shadow:
        audio, placed = build(
            practice_items(
                build_items,
                placed,
                practice_role=req.options.role_play,
                shadow_gap_ms=req.options.shadow_gap_ms if req.options.shadow else None,
            ),
            timing,
            role_gains=gains,
        )

    # Nhạc/âm nền từ thư viện, có thể nhiều lớp chồng nhau (trộn trước khi chuẩn hóa độ to)
    raw_layers = req.options.bgm if isinstance(req.options.bgm, list) else ([req.options.bgm] if req.options.bgm else [])
    bgm_layers: list[dict] = []
    for layer in raw_layers:
        ref, db = (layer, None) if isinstance(layer, str) else (layer.ref, layer.db)
        try:
            path = find_sound(ref, "bgm")
        except SoundNotFound as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None
        db = req.options.bgm_db if db is None else db
        audio = add_background(audio, AudioSegment.from_file(path), gain_db=db)
        bgm_layers.append({"path": str(path), "db": db})

    # Chuẩn hóa LUFS
    if req.options.lufs is not None:
        audio = loudness_normalize(audio, req.options.lufs)

    # 7. Xuất file
    base_name = sanitize_filename(req.filename or req.title)
    export_dir = output_dir / base_name  # mỗi bài một thư mục riêng, xuất lại cùng tên thì ghi đè
    export_dir.mkdir(parents=True, exist_ok=True)
    url_prefix = f"{urllib.parse.quote(base_name)}/"
    fmt = req.options.format
    audio_filename = f"{base_name}.{fmt}"
    audio_path = export_dir / audio_filename
    write_audio(audio, audio_path, fmt)

    timeline_filename = f"{base_name}.timeline.json"
    timeline_path = export_dir / timeline_filename
    write_timeline(audio, placed, timeline_path, bgm=bgm_layers)
    credit_lines = credits_for([l["path"] for l in bgm_layers] + [it["path"] for it in build_items if it.get("type") == "sfx"])

    base_url = str(request.base_url).rstrip("/")
    files_info: dict[str, Any] = {
        "audio": str(audio_path),
        "audio_url": f"{base_url}/files/{url_prefix}{audio_filename}",
        "timeline_json": str(timeline_path),
        "timeline_url": f"{base_url}/files/{url_prefix}{timeline_filename}",
    }
    if credit_lines:  # âm có giấy phép yêu cầu ghi công (vd. CC BY)
        credits_path = export_dir / f"{base_name}.credits.txt"
        credits_path.write_text("Âm thanh sử dụng:\n" + "\n".join(credit_lines) + "\n", encoding="utf-8")
        files_info["credits"] = str(credits_path)

    # Xuất phụ đề SRT
    if req.options.srt:
        srt_filename = f"{base_name}.srt"
        srt_path = export_dir / srt_filename
        srt_path.write_text(to_srt(placed), encoding="utf-8")
        files_info["srt"] = str(srt_path)
        files_info["srt_url"] = f"{base_url}/files/{url_prefix}{srt_filename}"

    # Xuất bản chậm 0.8x
    if req.options.slow:
        slow_rate = 0.8
        slow_audio = time_stretch(audio, slow_rate)
        slow_filename = f"{base_name}_slow.{fmt}"
        slow_path = export_dir / slow_filename
        write_audio(slow_audio, slow_path, fmt)
        files_info["slow_audio"] = str(slow_path)
        files_info["slow_url"] = f"{base_url}/files/{url_prefix}{slow_filename}"

        if req.options.srt:
            scaled = [
                {
                    **it,
                    "start_ms": round(it["start_ms"] / slow_rate),
                    "end_ms": round(it["end_ms"] / slow_rate),
                }
                for it in placed
            ]
            slow_srt_filename = f"{base_name}_slow.srt"
            slow_srt_path = export_dir / slow_srt_filename
            slow_srt_path.write_text(to_srt(scaled), encoding="utf-8")
            files_info["slow_srt"] = str(slow_srt_path)
            files_info["slow_srt_url"] = f"{base_url}/files/{url_prefix}{slow_srt_filename}"

    # Xuất phiếu học tập Furigana HTML
    if req.options.worksheet:
        html_content = worksheet_html(req.title, [it.model_dump() for it in project.items])
        html_filename = f"{base_name}.html"
        html_path = export_dir / html_filename
        html_path.write_text(html_content, encoding="utf-8")
        files_info["worksheet_html"] = str(html_path)
        files_info["worksheet_url"] = f"{base_url}/files/{url_prefix}{html_filename}"

    return {
        "ok": True,
        "title": req.title,
        "filename": base_name,
        "bgm": bgm_layers,
        "credits": credit_lines,
        "folder": str(export_dir),
        "duration_s": round(len(audio) / 1000, 2),
        "line_count": len([it for it in project.items if isinstance(it, LineItem)]),
        "files": files_info,
        "timeline": [
            {
                "id": it["id"],
                "role": it["role"],
                "start_ms": it["start_ms"],
                "end_ms": it["end_ms"],
                "text": it.get("plain", ""),
            }
            for it in placed
        ],
    }


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
