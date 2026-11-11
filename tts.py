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
import re
import sys
from dataclasses import replace
from pathlib import Path

import yaml
from pydub import AudioSegment
from pydantic import ValidationError
from tenacity import retry, stop_after_attempt, wait_exponential

from core.audio import add_background, limit_peak, loudness_normalize, peaks, role_levels, time_stretch
from core.lint import lint_project
from core.paths import sfx_path
from core.levels import timing_for
from core.render import build_items_for, finish, missing_scene_sounds, used_sound_paths
from core.sounds import SoundNotFound, credits_for, parse_layer, resolve_bgm
from core.readings import load_readings
from core.builder import build, practice_items, to_srt, trim_edges
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
from core.worksheet import worksheet_html
from providers.base import SynthRequest, TTSProvider
from providers.edge import VOICES as EDGE_VOICES
from providers.edge import EdgeProvider
from providers.voicevox import VoicevoxProvider, list_speakers
from providers.aivis import AivisProvider, list_speakers as aivis_list_speakers

ROOT = Path(__file__).resolve().parent
ROLE_FIELDS = ("voice", "emotion", "speed", "pitch")
MAX_CONCURRENCY = 3

PROVIDERS: dict[str, type[TTSProvider]] = {
    EdgeProvider.name: EdgeProvider,
    VoicevoxProvider.name: VoicevoxProvider,
    AivisProvider.name: AivisProvider,
}


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
    parts = [engine, req.voice, req.emotion, req.speed, str(req.pitch), req.text]
    if req.pause_scale != 1.0:  # giữ nguyên khóa cũ khi không chỉnh chỗ ngắt
        parts.append(f"pause={req.pause_scale:g}")
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()


# Một "câu" trong câu thoại: tới dấu kết câu 。！？!? (kèm ngoặc đóng ngay sau nếu có).
_SENTENCE_RE = re.compile(r"[^。！？!?]+(?:[。！？!?]+[」』）)]*)?|[。！？!?]+[」』）)]*")


def split_sentences(text: str) -> list[str]:
    """Tách câu thoại tại 。！？ để chèn khoảng lặng giữa các câu (engine thường đọc liền)."""
    parts = [p.strip() for p in _SENTENCE_RE.findall(text)]
    return [p for p in parts if p]


def join_sentences(paths: list[Path], pause_ms: int, out: Path) -> None:
    """Ghép các câu đã tổng hợp, chèn `pause_ms` lặng giữa từng câu, ghi WAV ra `out`."""
    joined = AudioSegment.empty()
    for i, p in enumerate(paths):
        if i:
            joined += AudioSegment.silent(pause_ms)
        joined += trim_edges(AudioSegment.from_file(p))
    joined.export(out, format="wav")


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

    engine = provider.name + getattr(provider, "cache_salt", "")
    timing = project.timing
    pause_scale = timing.comma_pause_scale if getattr(provider, "supports_pause_scale", False) else 1.0

    async def ensure(req: SynthRequest) -> tuple[str, Path]:
        """Tổng hợp `req` vào cache nếu chưa có. Trả về (khóa, đường dẫn)."""
        key = cache_key(engine, req)
        out = cache_dir / f"{key}.{provider.ext}"
        if not out.exists() or out.stat().st_size == 0:
            async with sem:
                tmp = out.with_suffix(".part")
                try:
                    await call(req, tmp)
                    tmp.replace(out)
                except BaseException:
                    tmp.unlink(missing_ok=True)
                    raise
        return key, out

    async def one(item: LineItem) -> None:
        if only_ids is not None and item.id not in only_ids:
            return
        req = replace(resolve(item, project.roles), pause_scale=pause_scale)
        sentences = split_sentences(req.text) if timing.sentence_pause_ms > 0 else []
        try:
            if len(sentences) <= 1:
                item.cache_key, out = await ensure(req)
            else:
                # Nhiều câu trong một câu thoại: đọc từng câu rồi chèn khoảng lặng giữa chúng.
                parts = await asyncio.gather(*(ensure(replace(req, text=s)) for s in sentences))
                raw = "|".join([*(k for k, _ in parts), f"gap={timing.sentence_pause_ms}"])
                key = hashlib.sha1(raw.encode("utf-8")).hexdigest()
                out = cache_dir / f"{key}.wav"
                if not out.exists() or out.stat().st_size == 0:
                    tmp = out.with_name(out.stem + ".part.wav")
                    await asyncio.to_thread(join_sentences, [p for _, p in parts], timing.sentence_pause_ms, tmp)
                    tmp.replace(out)
                item.cache_key = key
        except Exception as exc:  # noqa: BLE001 - báo lỗi theo câu, không dừng batch
            errors.append(f"{item.id} (dòng {item.src_line}): {exc}")
            item.audio = None
            return
        item.audio = str(out)

    await asyncio.gather(*(one(it) for it in project.items if isinstance(it, LineItem)))
    return errors


# Câu mẫu ngắn để nghe thử chất giọng (có 、 và 。 để nghe cả chỗ ngắt).
SAMPLE_TEXT = "こんにちは。今日は、いい天気ですね。"


async def sample_voice(provider: TTSProvider, req: SynthRequest, cache_dir: Path, output: Path) -> None:
    """Đọc một câu mẫu bằng giọng trong `req` (dùng cache như câu thoại) rồi ghi ra `output`."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = cache_key(provider.name + getattr(provider, "cache_salt", ""), req)
    cached = cache_dir / f"{key}.{provider.ext}"
    if not cached.exists() or cached.stat().st_size == 0:
        tmp = cached.with_suffix(".part")
        try:
            await provider.synthesize(req, str(tmp))
            tmp.replace(cached)
        finally:
            tmp.unlink(missing_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    AudioSegment.from_file(cached).export(output, format=output.suffix.lstrip(".").lower() or "mp3")


async def add_translations(project: Project, build_items: list[dict], voice: str, cache_dir: Path) -> list[dict]:
    """Chèn bản dịch (đọc bằng Edge) sau mỗi câu có '// bản dịch'."""
    lines = [it for it in project.items if isinstance(it, LineItem) and it.translation]
    if not lines:
        raise RuntimeError("chưa có bản dịch: viết sau mỗi câu ' // bản dịch tiếng Việt'")
    edge = PROVIDERS["edge"]()
    paths = await asyncio.gather(*(synth_cached(edge, SynthRequest(text=it.translation, voice=voice), cache_dir)
                                   for it in lines))
    by_id = {it.id: str(p) for it, p in zip(lines, paths)}
    out = []
    for it in build_items:
        out.append(it)
        if it.get("type") == "line" and it["id"] in by_id:
            out += [{"type": "pause", "ms": 450},
                    {"type": "sfx", "id": f"{it['id']}-vi", "path": by_id[it["id"]], "translation": True},
                    {"type": "pause", "ms": 600}]
    return out


def run_check(project: Project, cache_dir: Path) -> int:
    """--check: tổng hợp (có cache) rồi nghe lại từng câu, in JSON kết quả. Mã thoát 1 nếu có câu đáng ngờ."""
    from core import qc

    errors = asyncio.run(synth_all(project, PROVIDERS[project.engine](), cache_dir))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 2
    lines = [{"id": it.id, "text": it.tts_text, "display": it.display, "audio": it.audio}
             for it in project.items if isinstance(it, LineItem) and it.audio]
    try:
        results = qc.check_lines(lines)
    except qc.QCUnavailable as exc:
        print(str(exc), file=sys.stderr)
        return 3
    print(json.dumps(results, ensure_ascii=False))
    return 0 if all(r["ok"] for r in results) else 1


async def synth_cached(provider: TTSProvider, req: SynthRequest, cache_dir: Path) -> Path:
    """Tổng hợp một câu lẻ (vd. bản dịch tiếng Việt) vào cache, trả về đường dẫn file."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = cache_key(provider.name + getattr(provider, "cache_salt", ""), req)
    cached = cache_dir / f"{key}.{provider.ext}"
    if not cached.exists() or cached.stat().st_size == 0:
        tmp = cached.with_suffix(".part")
        try:
            await provider.synthesize(req, str(tmp))
            tmp.replace(cached)
        finally:
            tmp.unlink(missing_ok=True)
    return cached


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


def project_from_script(script: Path, cfg: Config, readings: dict[str, str] | None = None) -> Project:
    items = [
        {k: v for k, v in it.items() if k != "text"}  # "text" thô đã có tts_text/display/plain
        for it in parse_script(script.read_text(encoding="utf-8"), readings)
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


def _cache_command(cache_dir: Path, *, clear: bool) -> int:
    files = [p for p in cache_dir.glob("*") if p.is_file()] if cache_dir.is_dir() else []
    size_mb = sum(p.stat().st_size for p in files) / 1_000_000
    if not clear:
        print(f"Cache {cache_dir}: {len(files)} file, {size_mb:.1f} MB")
        return 0
    for p in files:
        p.unlink()
    print(f"Đã xóa {len(files)} file ({size_mb:.1f} MB) trong {cache_dir}")
    return 0


def _strip_options(argv: list[str], names: set[str]) -> list[str]:
    """Bỏ các tùy chọn (kèm giá trị) có tên trong `names` khỏi danh sách tham số."""
    out, skip = [], False
    for tok in argv:
        if skip:
            skip = False
            continue
        if tok in names:
            skip = True
            continue
        if any(tok.startswith(n + "=") for n in names):
            continue
        out.append(tok)
    return out


def run_batch(batch_dir: Path, outdir: Path, argv: list[str]) -> int:
    """Chạy lần lượt mọi kịch bản .txt trong thư mục; mỗi file ra <tên>.mp3 trong outdir.

    Tùy chọn còn lại (--lufs, --srt, --bgm...) được truyền nguyên cho từng file.
    Một file lỗi không dừng batch; cuối cùng trả về 1 nếu có file lỗi.
    """
    scripts = sorted(batch_dir.glob("*.txt"))
    if not scripts:
        print(f"Không có kịch bản .txt trong {batch_dir}", file=sys.stderr)
        return 2
    extra = _strip_options(argv, {"--batch", "--outdir"})
    failed = []
    for script in scripts:
        print(f"== {script.name}")
        code = main([str(script), "-o", str(outdir / f"{script.stem}.mp3"), *extra])
        if code != 0:
            failed.append(script.name)
    if failed:
        print("Các file lỗi: " + ", ".join(failed), file=sys.stderr)
        return 1
    print(f"Hoàn tất {len(scripts)} kịch bản.")
    return 0


def main(argv: list[str] | None = None) -> int:
    # Khi GUI gọi qua pipe trên Windows, stdout mặc định dùng cp1252 và in tiếng Việt (ví dụ "Đ") sẽ làm tiến trình lỗi.
    for stream in (sys.stdout, sys.stderr):
        if stream is not None and hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="TTS hội thoại tiếng Nhật")
    src = ap.add_mutually_exclusive_group()
    src.add_argument("script", nargs="?", type=Path, help="file kịch bản .txt")
    src.add_argument("--project", type=Path, help="đọc project.json đã lưu")
    ap.add_argument("-o", "--output", type=Path, help="file đầu ra (.mp3 hoặc .wav)")
    ap.add_argument("--roles", type=Path, default=ROOT / "roles.yaml")
    ap.add_argument("--sample", choices=sorted(PROVIDERS), metavar="ENGINE",
                    help="đọc thử một câu mẫu bằng giọng --voice của engine rồi ghi ra -o (chọn nhanh giọng)")
    ap.add_argument("--voice", help="giọng cho --sample (tên giọng Edge hoặc mã style VOICEVOX/AivisSpeech)")
    ap.add_argument("--emotion", default="neutral", choices=["neutral", "happy", "sad", "angry", "surprised"],
                    help="cảm xúc cho --sample")
    ap.add_argument("--speed", default="normal", choices=["slow", "normal", "fast"], help="tốc độ cho --sample")
    ap.add_argument("--pitch", type=int, default=0, help="cao độ (Hz) cho --sample")
    ap.add_argument("--sample-text", default=SAMPLE_TEXT, help="câu đọc mẫu cho --sample")
    ap.add_argument("--list-voices", choices=sorted(PROVIDERS), metavar="ENGINE",
                    help="in danh sách giọng của engine dạng JSON (edge, voicevox, aivis) rồi thoát")
    ap.add_argument("--batch", type=Path, metavar="DIR",
                    help="xử lý mọi file .txt trong thư mục (cần --outdir)")
    ap.add_argument("--outdir", type=Path, metavar="DIR", help="thư mục đầu ra cho --batch")
    ap.add_argument("--resolve-sfx", action="store_true",
                    help="ghi đường dẫn sfx tuyệt đối khi nhập kịch bản (dùng khi project.json ở thư mục khác)")
    ap.add_argument("--lint", action="store_true",
                    help="kiểm tra kịch bản/project, in JSON các lỗi và cảnh báo rồi thoát")
    ap.add_argument("--cache-info", action="store_true", help="in số file và dung lượng thư mục cache rồi thoát")
    ap.add_argument("--clear-cache", action="store_true", help="xóa thư mục cache rồi thoát")
    ap.add_argument("--readings", type=Path, default=ROOT / "readings.yaml",
                    help="từ điển cách đọc (từ: kana), áp dụng khi nhập kịch bản")
    ap.add_argument("--cache-dir", type=Path, default=ROOT / "cache")
    ap.add_argument("--save-project", type=Path, help="lưu kết quả phân tích ra project.json")
    ap.add_argument("--srt", action="store_true", help="xuất thêm phụ đề .srt")
    ap.add_argument("--preview", metavar="ID", help="chỉ tổng hợp câu có mã ID (ví dụ L002) để nghe thử")
    ap.add_argument("--dry-run", action="store_true", help="chỉ in kế hoạch, không gọi API")
    ap.add_argument("--lufs", type=float, metavar="LUFS", help="chuẩn hóa độ to về mức LUFS, ví dụ -16")
    ap.add_argument("--slow", action="store_true",
                    help="xuất thêm bản chậm 0.8× (giữ cao độ), tên <tên>_slow.<đuôi>")
    ap.add_argument("--role-play", metavar="VAI",
                    help="bản luyện nói: chỉ giữ lời vai này, các vai khác thành khoảng lặng")
    ap.add_argument("--shadow", action="store_true",
                    help="bản shadowing: sau mỗi câu luyện tập chèn khoảng lặng để nhắc lại")
    ap.add_argument("--shadow-gap", type=int, default=1500, metavar="MS",
                    help="khoảng lặng thêm sau mỗi câu khi dùng --shadow (mặc định 1500 ms)")
    ap.add_argument("--level", choices=["N5", "N4", "N3", "N2", "N1"],
                    help="nhịp đọc theo trình độ: N5 chậm và nghỉ lâu ... N1 gần tự nhiên")
    ap.add_argument("--bilingual", action="store_true",
                    help="bản song ngữ: đọc bản dịch (sau '//' của mỗi câu) ngay sau câu đó, giọng Edge (cần Internet)")
    ap.add_argument("--translation-voice", default="vi-VN-HoaiMyNeural", help="giọng Edge đọc bản dịch")
    ap.add_argument("--check", action="store_true",
                    help="tự kiểm tra phát âm: nghe lại từng câu (Whisper), in JSON các câu đáng ngờ rồi thoát")
    ap.add_argument("--worksheet", type=Path, metavar="FILE.html",
                    help="xuất phiếu học tập HTML có furigana (không cần tạo âm thanh)")
    ap.add_argument("--export-lines", type=Path, metavar="DIR",
                    help="xuất từng câu thành file riêng để luyện tập")
    ap.add_argument("--bgm", action="append", default=[], metavar="FILE[@dB]",
                    help="nhạc/âm nền lặp lại, trộn dưới lời thoại. Lặp lại để chồng nhiều lớp "
                    "(vd. --bgm mua --bgm duong-pho@-24). Nhận đường dẫn file hoặc tên âm trong thư viện")
    ap.add_argument("--bgm-db", type=float, default=-18.0,
                    help="độ nhỏ mặc định của mỗi lớp nền so với lời thoại, dB (mặc định -18)")
    argv = sys.argv[1:] if argv is None else argv
    args = ap.parse_args(argv)

    if args.cache_info or args.clear_cache:
        return _cache_command(args.cache_dir, clear=args.clear_cache)

    if args.sample:
        if not args.voice or not args.output:
            ap.error("--sample cần --voice và -o")
        req = SynthRequest(text=args.sample_text.strip() or SAMPLE_TEXT, voice=args.voice, emotion=args.emotion,
                           speed=args.speed, pitch=args.pitch)
        try:
            asyncio.run(sample_voice(PROVIDERS[args.sample](), req, args.cache_dir, args.output))
        except Exception as exc:  # noqa: BLE001 - báo lỗi gọn cho giao diện
            print(f"Không đọc thử được giọng {args.voice}: {exc}", file=sys.stderr)
            return 1
        print(f"Đã xuất câu mẫu ra {args.output}")
        return 0
    if args.list_voices:
        if args.list_voices == "voicevox":
            voices = asyncio.run(list_speakers())
        elif args.list_voices == "aivis":
            voices = asyncio.run(aivis_list_speakers(only_normal=True))
        else:
            voices = [{"value": v, "label": v} for v in EDGE_VOICES]
        print(json.dumps(voices, ensure_ascii=False))
        return 0
    if args.batch:
        if args.script or args.project or args.outdir is None:
            ap.error("--batch cần --outdir và không dùng cùng kịch bản đơn hoặc --project")
        return run_batch(args.batch, args.outdir, argv)
    if not (args.script or args.project):
        ap.error("cần truyền kịch bản .txt hoặc --project")

    try:
        if args.project:
            project = load_project(args.project)
        else:
            readings = load_readings(args.readings)
            project = project_from_script(args.script, load_config(args.roles), readings)
            if args.resolve_sfx:
                # Đổi đường dẫn sfx tương đối thành tuyệt đối theo thư mục kịch bản gốc,
                # để project.json đặt ở thư mục khác vẫn tìm được file.
                for it in project.items:
                    if isinstance(it, SfxItem):
                        it.path = str(sfx_path(it.path, args.script.resolve().parent).resolve())
    except (ScriptError, ValidationError, yaml.YAMLError, OSError, ValueError) as exc:
        print(f"Lỗi: {exc}", file=sys.stderr)
        return 2

    if args.save_project:
        save_project(project, args.save_project)
        print(f"Đã lưu {args.save_project}")

    if args.lint:
        issues = lint_project(project, (args.script or args.project).resolve().parent)
        print(json.dumps(issues, ensure_ascii=False))
        return 1 if any(i["level"] == "error" for i in issues) else 0

    if args.worksheet:
        args.worksheet.parent.mkdir(parents=True, exist_ok=True)
        args.worksheet.write_text(
            worksheet_html(project.title, [it.model_dump() for it in project.items],
                           roles={k: {"name": r.name} for k, r in project.roles.items()}),
            encoding="utf-8",
        )
        print(f"Đã xuất phiếu học tập {args.worksheet}")
        if args.dry_run or not args.output:
            return 0

    if args.level:  # nhịp đọc theo trình độ (khoảng nghỉ áp ngay; tốc độ áp sau khi ghép)
        project.timing = project.timing.model_copy(update=timing_for(args.level, project.timing.model_dump())[0])

    if args.check:
        return run_check(project, args.cache_dir)

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
    missing_files += missing_scene_sounds(project)
    bgm_layers: list[tuple[Path, float]] = []
    for spec in args.bgm:
        ref, db = parse_layer(spec, args.bgm_db)
        try:
            bgm_layers.append((resolve_bgm(ref), db))
        except SoundNotFound as exc:
            missing_files.append(f"{ref} ({exc})")
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

    build_items = build_items_for(project, base)
    gains = {k: r.gain_db for k, r in project.roles.items()}
    timing = project.timing.model_dump()
    if args.bilingual:
        try:
            build_items = asyncio.run(add_translations(project, build_items, args.translation_voice, args.cache_dir))
        except (RuntimeError, OSError) as exc:
            print(f"Lỗi bản song ngữ: {exc}", file=sys.stderr)
            return 2
    markers: list[dict] = []
    audio, placed = build(build_items, timing, role_gains=gains, markers=markers)
    if args.role_play or args.shadow:
        if args.role_play and args.role_play not in project.roles:
            print(f"Không có vai {args.role_play} trong project", file=sys.stderr)
            return 2
        shadow_gap = args.shadow_gap if args.shadow else None
        markers = []
        audio, placed = build(
            practice_items(build_items, placed,
                           practice_role=args.role_play, shadow_gap_ms=shadow_gap),
            timing,
            role_gains=gains,
            markers=markers,
        )
    _, rate = timing_for(args.level, timing)
    if rate != 1.0:  # tốc độ đọc theo trình độ: co giãn, dời mốc thời gian tương ứng
        audio = time_stretch(audio, rate)
        placed = [{**p, "start_ms": round(p["start_ms"] / rate), "end_ms": round(p["end_ms"] / rate)} for p in placed]
        markers = [{**m, "start_ms": round(m["start_ms"] / rate),
                    **({"end_ms": round(m["end_ms"] / rate)} if "end_ms" in m else {})} for m in markers]
    layers = [{"path": str(f), "db": db} for f, db in bgm_layers]
    audio = finish(audio, markers, layers)  # nền theo cảnh + các lớp nền suốt bài
    if args.lufs is not None:
        audio = loudness_normalize(audio, args.lufs)

    fmt = args.output.suffix.lstrip(".").lower() or "mp3"
    write_audio(audio, args.output, fmt)
    print(f"Đã xuất {args.output} ({len(audio) / 1000:.1f} s, {len(placed)} câu)")
    timeline_path = args.output.with_name(f"{args.output.stem}.timeline.json")
    write_timeline(audio, placed, timeline_path, markers=markers, bgm=layers)
    print(f"Đã xuất dữ liệu timeline {timeline_path}")
    used = used_sound_paths(markers, layers)
    credit_lines = credits_for(used)
    if credit_lines:  # âm có giấy phép yêu cầu ghi công (vd. CC BY): ghi kèm bài
        credits_path = args.output.with_name(f"{args.output.stem}.credits.txt")
        credits_path.write_text("Âm thanh sử dụng:\n" + "\n".join(credit_lines) + "\n", encoding="utf-8")
        print(f"Đã ghi nguồn âm thanh {credits_path}")

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
    limit_peak(audio).export(path, format=fmt)


def write_timeline(audio, placed: list[dict], path: Path, markers: list[dict] | None = None,
                   bgm: list[dict] | None = None) -> None:
    """Vị trí từng câu, hiệu ứng sfx, nhạc nền và dữ liệu sóng, để giao diện vẽ timeline nhiều track."""
    data = {
        "sfx": [m for m in markers or [] if m.get("type") == "sfx"],
        "scenes": [m for m in markers or [] if m.get("type") == "scene"],
        "bgm": bgm or [],  # các lớp nền: [{"path", "db"}]
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
