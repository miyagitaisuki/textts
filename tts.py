"""CLI tạo âm thanh hội thoại tiếng Nhật.

Đầu vào: kịch bản .txt (kèm roles.yaml) hoặc project.json đã lưu.
    python tts.py script.txt -o output/bai10.mp3 [--srt] [--save-project projects/bai10.json]
    python tts.py --project projects/bai10.json -o output/bai10.mp3

Mỗi câu được tổng hợp song song có cache theo hash, nên sửa một câu chỉ tạo lại đúng câu đó.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from pathlib import Path

import yaml
from pydub import AudioSegment
from pydantic import ValidationError
from tenacity import retry, stop_after_attempt, wait_exponential

from core.audio import add_background, loudness_normalize, peaks, role_levels, time_stretch
from core.builder import build, to_srt
from core.models import (
    Config,
    LineItem,
    Project,
    Role,
    SfxItem,
    load_config,
    load_project,
    save_project,
)
from core.parser import ScriptError, parse_script
from providers.base import SynthRequest, TTSProvider
from providers.edge import VOICES as EDGE_VOICES
from providers.edge import EdgeProvider
from providers.voicevox import VoicevoxProvider, list_speakers

ROOT = Path(__file__).resolve().parent
ROLE_FIELDS = ("voice", "emotion", "speed", "pitch")
MAX_CONCURRENCY = 3

PROVIDERS: dict[str, type[TTSProvider]] = {
    EdgeProvider.name: EdgeProvider,
    VoicevoxProvider.name: VoicevoxProvider,
}


def sfx_path(path: str, base: Path) -> Path:
    """Đường dẫn sfx tương đối được tính từ thư mục chứa kịch bản/project.json."""
    p = Path(path)
    return p if p.is_absolute() else base / p


def resolve(item: LineItem, roles: dict[str, Role]) -> SynthRequest:
    """Gộp cấu hình vai với thuộc tính ghi riêng ở câu (câu thắng)."""
    role = roles[item.role]
    merged = {k: getattr(role, k) for k in ROLE_FIELDS}
    for k, v in item.attrs.items():
        if k in ROLE_FIELDS:
            merged[k] = v
    return SynthRequest(
        text=item.tts_text,
        voice=str(merged["voice"]),
        emotion=str(merged["emotion"]),
        speed=str(merged["speed"]),
        pitch=int(merged["pitch"]),
    )


def cache_key(engine: str, req: SynthRequest) -> str:
    raw = "|".join([engine, req.voice, req.emotion, req.speed, str(req.pitch), req.text])
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


async def synth_all(
    project: Project,
    provider: TTSProvider,
    cache_dir: Path,
    *,
    max_concurrency: int = MAX_CONCURRENCY,
    attempts: int = 3,
    wait_min: float = 1,
    wait_max: float = 4,
    only_ids: set[str] | None = None,
) -> list[str]:
    """Tổng hợp mọi câu song song có giới hạn. Trả về danh sách lỗi (rỗng nếu ổn)."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(max_concurrency)
    errors: list[str] = []

    @retry(
        stop=stop_after_attempt(attempts),
        wait=wait_exponential(multiplier=1, min=wait_min, max=wait_max),
        reraise=True,
    )
    async def call(req: SynthRequest, out: Path) -> None:
        await provider.synthesize(req, str(out))

    async def one(item: LineItem) -> None:
        if only_ids is not None and item.id not in only_ids:
            return
        req = resolve(item, project.roles)
        key = cache_key(provider.name, req)
        out = cache_dir / f"{key}.{provider.ext}"
        item.cache_key = key
        if not out.exists() or out.stat().st_size == 0:
            async with sem:
                tmp = out.with_suffix(".part")
                try:
                    await call(req, tmp)
                    tmp.replace(out)
                except Exception as exc:  # noqa: BLE001 - báo lỗi theo câu, không dừng batch
                    tmp.unlink(missing_ok=True)
                    errors.append(f"{item.id} (dòng {item.src_line}): {exc}")
                    item.audio = None
                    return
        item.audio = str(out)

    await asyncio.gather(*(one(it) for it in project.items if isinstance(it, LineItem)))
    return errors


def dry_run(project: Project) -> None:
    for it in project.items:
        if isinstance(it, SfxItem):
            print(f"{it.id}  [sfx {it.path}]")
            continue
        if not isinstance(it, LineItem):
            print(f"{it.id}  [pause {it.ms} ms]")
            continue
        req = resolve(it, project.roles)
        print(
            f"{it.id}  vai={it.role} voice={req.voice} "
            f"emotion={req.emotion} speed={req.speed} pitch={req.pitch:+d}  "
            f"| {it.display}"
        )
        if it.display != it.tts_text:
            print(f"        đọc: {it.tts_text}")


def project_from_script(script: Path, cfg: Config) -> Project:
    items = [
        {k: v for k, v in it.items() if k != "text"}  # "text" thô đã có tts_text/display/plain
        for it in parse_script(script.read_text(encoding="utf-8"))
    ]
    return Project.model_validate(
        {
            "title": script.stem,
            "engine": cfg.engine,
            "timing": cfg.timing.model_dump(),
            "roles": {k: v.model_dump() for k, v in cfg.roles.items()},
            "items": items,
        }
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="TTS hội thoại tiếng Nhật")
    src = ap.add_mutually_exclusive_group()
    src.add_argument("script", nargs="?", type=Path, help="file kịch bản .txt")
    src.add_argument("--project", type=Path, help="đọc project.json đã lưu")
    ap.add_argument("-o", "--output", type=Path, help="file đầu ra (.mp3 hoặc .wav)")
    ap.add_argument("--roles", type=Path, default=ROOT / "roles.yaml")
    ap.add_argument("--list-voices", choices=sorted(PROVIDERS), metavar="ENGINE",
                    help="in danh sách giọng của engine dạng JSON (edge hoặc voicevox) rồi thoát")
    ap.add_argument("--cache-dir", type=Path, default=ROOT / "cache")
    ap.add_argument("--save-project", type=Path, help="lưu kết quả phân tích ra project.json")
    ap.add_argument("--srt", action="store_true", help="xuất thêm phụ đề .srt")
    ap.add_argument("--preview", metavar="ID", help="chỉ tổng hợp câu có mã ID (ví dụ L002) để nghe thử")
    ap.add_argument("--dry-run", action="store_true", help="chỉ in kế hoạch, không gọi API")
    ap.add_argument("--lufs", type=float, metavar="LUFS", help="chuẩn hóa độ to về mức LUFS, ví dụ -16")
    ap.add_argument("--slow", action="store_true",
                    help="xuất thêm bản chậm 0.8× (giữ cao độ), tên <tên>_slow.<đuôi>")
    ap.add_argument("--export-lines", type=Path, metavar="DIR",
                    help="xuất từng câu thành file riêng để luyện tập")
    ap.add_argument("--bgm", type=Path, metavar="FILE",
                    help="nhạc nền lặp lại, trộn dưới lời thoại (mp3/wav/...)")
    ap.add_argument("--bgm-db", type=float, default=-18.0,
                    help="độ nhỏ của nhạc nền so với lời thoại, dB (mặc định -18)")
    args = ap.parse_args(argv)

    if args.list_voices:
        if args.list_voices == "voicevox":
            voices = asyncio.run(list_speakers())
        else:
            voices = [{"value": v, "label": v} for v in EDGE_VOICES]
        print(json.dumps(voices, ensure_ascii=False))
        return 0
    if not (args.script or args.project):
        ap.error("cần truyền kịch bản .txt hoặc --project")

    try:
        if args.project:
            project = load_project(args.project)
        else:
            project = project_from_script(args.script, load_config(args.roles))
    except (ScriptError, ValidationError, yaml.YAMLError, OSError, ValueError) as exc:
        print(f"Lỗi: {exc}", file=sys.stderr)
        return 2

    if args.save_project:
        save_project(project, args.save_project)
        print(f"Đã lưu {args.save_project}")

    if args.dry_run or not args.output:
        dry_run(project)
        if not args.dry_run and not args.save_project:
            print("\n(Thêm -o <file> để tạo âm thanh.)")
        return 0

    if project.engine not in PROVIDERS:
        print(f"Engine không hỗ trợ: {project.engine}", file=sys.stderr)
        return 2
    base = (args.script or args.project).resolve().parent
    missing_files = [
        str(sfx_path(it.path, base)) for it in project.items
        if isinstance(it, SfxItem) and not sfx_path(it.path, base).is_file()
    ]
    if args.bgm and not args.bgm.is_file():
        missing_files.append(str(args.bgm))
    if missing_files:
        print("Không tìm thấy file âm thanh: " + ", ".join(missing_files), file=sys.stderr)
        return 2
    provider = PROVIDERS[project.engine]()

    if args.preview:
        known = {it.id for it in project.items if isinstance(it, LineItem)}
        if args.preview not in known:
            print(f"Không có câu thoại mã {args.preview}", file=sys.stderr)
            return 2
        only = {args.preview}
    else:
        only = None
    errors = asyncio.run(synth_all(project, provider, args.cache_dir, only_ids=only))
    if args.save_project:
        save_project(project, args.save_project)
    if errors:
        print("Các câu lỗi, chưa xuất file:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    if args.preview:
        item = next(it for it in project.items if it.id == args.preview)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        AudioSegment.from_file(item.audio).export(
            args.output, format=args.output.suffix.lstrip(".").lower() or "mp3"
        )
        print(f"Đã xuất câu {args.preview} ra {args.output}")
        return 0

    build_items = [
        {**it.model_dump(), "path": str(sfx_path(it.path, base))}
        if isinstance(it, SfxItem) else it.model_dump()
        for it in project.items
    ]
    audio, placed = build(
        build_items,
        project.timing.model_dump(),
        role_gains={k: r.gain_db for k, r in project.roles.items()},
    )
    if args.bgm:
        bgm = AudioSegment.from_file(args.bgm)
        audio = add_background(audio, bgm, gain_db=args.bgm_db)
    if args.lufs is not None:
        audio = loudness_normalize(audio, args.lufs)

    fmt = args.output.suffix.lstrip(".").lower() or "mp3"
    write_audio(audio, args.output, fmt)
    print(f"Đã xuất {args.output} ({len(audio) / 1000:.1f} s, {len(placed)} câu)")
    timeline_path = args.output.with_name(f"{args.output.stem}.timeline.json")
    write_timeline(audio, placed, timeline_path)
    print(f"Đã xuất dữ liệu timeline {timeline_path}")

    if args.srt:
        srt_path = args.output.with_suffix(".srt")
        srt_path.write_text(to_srt(placed), encoding="utf-8")
        print(f"Đã xuất phụ đề {srt_path}")

    if args.slow:
        slow_rate = 0.8
        slow_audio = time_stretch(audio, slow_rate)
        slow_path = args.output.with_name(f"{args.output.stem}_slow{args.output.suffix}")
        write_audio(slow_audio, slow_path, fmt)
        print(f"Đã xuất bản chậm {slow_path} ({len(slow_audio) / 1000:.1f} s)")
        if args.srt:
            scaled = [
                {**it, "start_ms": round(it["start_ms"] / slow_rate),
                 "end_ms": round(it["end_ms"] / slow_rate)}
                for it in placed
            ]
            slow_srt = slow_path.with_suffix(".srt")
            slow_srt.write_text(to_srt(scaled), encoding="utf-8")
            print(f"Đã xuất phụ đề bản chậm {slow_srt}")

    if args.export_lines:
        export_lines(project, args.export_lines)
    return 0


def write_audio(audio, path: Path, fmt: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    audio.export(path, format=fmt)


def write_timeline(audio, placed: list[dict], path: Path) -> None:
    """Vị trí từng câu và dữ liệu sóng, để giao diện vẽ timeline."""
    data = {
        "duration_ms": len(audio),
        "peaks": peaks(audio, bins=600),
        "role_levels": role_levels(audio, placed, bins=600),
        "items": [
            {"id": it["id"], "role": it["role"], "start_ms": it["start_ms"], "end_ms": it["end_ms"]}
            for it in placed
        ],
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def export_lines(project: Project, out_dir: Path) -> None:
    """Mỗi câu một file: <mã>_vai<số>.mp3, dùng cho luyện nghe và nói theo."""
    out_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for it in project.items:
        if isinstance(it, LineItem) and it.audio:
            name = f"{it.id}_vai{it.role}.mp3"
            AudioSegment.from_file(it.audio).export(out_dir / name, format="mp3")
            count += 1
    print(f"Đã xuất {count} câu riêng vào {out_dir}")


if __name__ == "__main__":
    raise SystemExit(main())
