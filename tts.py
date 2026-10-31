"""CLI: python tts.py script.txt -o output/bai10.mp3

Đọc kịch bản hội thoại, tổng hợp từng câu bằng engine đã chọn (có cache),
rồi ghép thành một file âm thanh theo thứ tự.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import sys
from pathlib import Path

import yaml
from tenacity import retry, stop_after_attempt, wait_exponential

from core.builder import build, to_srt
from core.parser import ScriptError, parse_script, roles_used
from providers.base import SynthRequest, TTSProvider
from providers.edge import EdgeProvider

ROOT = Path(__file__).resolve().parent
ROLE_FIELDS = ("voice", "emotion", "speed", "pitch")
MAX_CONCURRENCY = 3

PROVIDERS: dict[str, type[TTSProvider]] = {EdgeProvider.name: EdgeProvider}


def load_config(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    cfg.setdefault("engine", "edge")
    cfg.setdefault("roles", {})
    cfg.setdefault("timing", {})
    return cfg


def resolve(item: dict, cfg: dict) -> SynthRequest:
    """Gộp cấu hình vai với thuộc tính ghi riêng ở câu (câu thắng)."""
    role_cfg = cfg["roles"][item["role"]]
    merged = {k: role_cfg.get(k) for k in ROLE_FIELDS}
    merged.update({k: v for k, v in item["attrs"].items() if k in ROLE_FIELDS})
    return SynthRequest(
        text=item["tts_text"],
        voice=str(merged["voice"]),
        emotion=str(merged["emotion"] or "neutral"),
        speed=str(merged["speed"] or "normal"),
        pitch=int(merged["pitch"] or 0),
    )


def cache_key(engine: str, req: SynthRequest) -> str:
    raw = "|".join(
        [engine, req.voice, req.emotion, req.speed, str(req.pitch), req.text]
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def check_roles(items: list[dict], cfg: dict) -> None:
    missing = sorted(roles_used(items) - set(cfg["roles"]))
    if missing:
        raise ScriptError(
            "Vai chưa được cấu hình trong roles file: " + ", ".join(missing)
        )
    for role in roles_used(items):
        if not cfg["roles"][role].get("voice"):
            raise ScriptError(f"Vai {role} chưa có 'voice' trong roles file")


async def synth_all(
    items: list[dict],
    cfg: dict,
    provider: TTSProvider,
    cache_dir: Path,
) -> list[str]:
    """Tổng hợp mọi câu song song có giới hạn. Trả về danh sách lỗi (rỗng nếu ổn)."""
    sem = asyncio.Semaphore(MAX_CONCURRENCY)
    errors: list[str] = []

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        reraise=True,
    )
    async def call(req: SynthRequest, out: Path) -> None:
        await provider.synthesize(req, str(out))

    async def one(item: dict) -> None:
        req = resolve(item, cfg)
        key = cache_key(provider.name, req)
        out = cache_dir / f"{key}.mp3"
        item["cache_key"] = key
        if not out.exists() or out.stat().st_size == 0:
            async with sem:
                tmp = out.with_suffix(".part")
                try:
                    await call(req, tmp)
                    tmp.replace(out)
                except Exception as exc:  # noqa: BLE001 - báo lỗi theo câu, không dừng batch
                    tmp.unlink(missing_ok=True)
                    errors.append(f"{item['id']} (dòng {item['src_line']}): {exc}")
                    return
        item["audio"] = str(out)

    await asyncio.gather(*(one(it) for it in items if it["type"] == "line"))
    return errors


def dry_run(items: list[dict], cfg: dict) -> None:
    for it in items:
        if it["type"] == "pause":
            print(f"{it['id']}  [pause {it['ms']} ms]")
            continue
        req = resolve(it, cfg)
        print(
            f"{it['id']}  vai={it['role']} voice={req.voice} "
            f"emotion={req.emotion} speed={req.speed} pitch={req.pitch:+d}  "
            f"| {it['display']}"
        )
        if it["display"] != it["tts_text"]:
            print(f"        đọc: {it['tts_text']}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="TTS hội thoại tiếng Nhật")
    ap.add_argument("script", type=Path, help="file kịch bản .txt")
    ap.add_argument("-o", "--output", type=Path, help="file đầu ra (.mp3 hoặc .wav)")
    ap.add_argument("--roles", type=Path, default=ROOT / "roles.yaml")
    ap.add_argument("--cache-dir", type=Path, default=ROOT / "cache")
    ap.add_argument("--srt", action="store_true", help="xuất thêm phụ đề .srt")
    ap.add_argument("--dry-run", action="store_true", help="chỉ in kế hoạch, không gọi API")
    args = ap.parse_args(argv)

    try:
        cfg = load_config(args.roles)
        items = parse_script(args.script.read_text(encoding="utf-8"))
        check_roles(items, cfg)
    except (ScriptError, KeyError, yaml.YAMLError, OSError) as exc:
        print(f"Lỗi: {exc}", file=sys.stderr)
        return 2

    if args.dry_run or not args.output:
        dry_run(items, cfg)
        if not args.dry_run:
            print("\n(Thêm -o <file> để tạo âm thanh.)")
        return 0

    engine = cfg["engine"]
    if engine not in PROVIDERS:
        print(f"Engine không hỗ trợ: {engine}", file=sys.stderr)
        return 2
    provider = PROVIDERS[engine]()

    args.cache_dir.mkdir(parents=True, exist_ok=True)
    errors = asyncio.run(synth_all(items, cfg, provider, args.cache_dir))
    if errors:
        print("Các câu lỗi, chưa xuất file:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    audio, placed = build(items, cfg["timing"])
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
