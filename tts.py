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
import sys
from pathlib import Path

import yaml
from pydub import AudioSegment
from pydantic import ValidationError
from tenacity import retry, stop_after_attempt, wait_exponential

from core.builder import build, to_srt
from core.models import Config, LineItem, Project, Role, load_config, load_project, save_project
from core.parser import ScriptError, parse_script
from providers.base import SynthRequest, TTSProvider
from providers.edge import EdgeProvider

ROOT = Path(__file__).resolve().parent
ROLE_FIELDS = ("voice", "emotion", "speed", "pitch")
MAX_CONCURRENCY = 3

PROVIDERS: dict[str, type[TTSProvider]] = {EdgeProvider.name: EdgeProvider}


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
        out = cache_dir / f"{key}.mp3"
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
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("script", nargs="?", type=Path, help="file kịch bản .txt")
    src.add_argument("--project", type=Path, help="đọc project.json đã lưu")
    ap.add_argument("-o", "--output", type=Path, help="file đầu ra (.mp3 hoặc .wav)")
    ap.add_argument("--roles", type=Path, default=ROOT / "roles.yaml")
    ap.add_argument("--cache-dir", type=Path, default=ROOT / "cache")
    ap.add_argument("--save-project", type=Path, help="lưu kết quả phân tích ra project.json")
    ap.add_argument("--srt", action="store_true", help="xuất thêm phụ đề .srt")
    ap.add_argument("--preview", metavar="ID", help="chỉ tổng hợp câu có mã ID (ví dụ L002) để nghe thử")
    ap.add_argument("--dry-run", action="store_true", help="chỉ in kế hoạch, không gọi API")
    args = ap.parse_args(argv)

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

    audio, placed = build(
        [it.model_dump() for it in project.items], project.timing.model_dump()
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fmt = args.output.suffix.lstrip(".").lower() or "mp3"
    audio.export(args.output, format=fmt)
    print(f"Đã xuất {args.output} ({len(audio) / 1000:.1f} s, {len(placed)} câu)")

    if args.srt:
        srt_path = args.output.with_suffix(".srt")
        srt_path.write_text(to_srt(placed), encoding="utf-8")
        print(f"Đã xuất phụ đề {srt_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
