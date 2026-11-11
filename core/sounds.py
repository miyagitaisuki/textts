"""Thư viện âm thanh dùng chung với app: gói CC0 của textts + âm giáo viên tự thêm.

Cấu trúc (giống gui/electron/sound-library.cjs):
    <userData>/sound-library/pack/<version>/<file>   âm của gói đã tải
    <userData>/sound-library/my/sfx|bgm/<file>       âm cá nhân
Danh mục gói: gui/electron/sound-pack.json (đi kèm engine trong bộ cài).

AI (qua API/MCP) gọi theo tên: "cong-vien", "Công viên", "bgm-cong-vien" hay tên file cá nhân đều được.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import unicodedata
import urllib.request
from pathlib import Path

from core.appdata import user_data_dir

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "gui" / "electron" / "sound-pack.json"
KINDS = ("sfx", "bgm")
AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".m4a"}


class SoundNotFound(LookupError):
    pass


def library_dir() -> Path:
    env = os.environ.get("TEXTTS_SOUND_LIBRARY")
    return Path(env) if env else user_data_dir() / "sound-library"


def load_manifest(path: Path | None = None) -> dict:
    try:
        return json.loads((path or MANIFEST).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"version": "v1", "baseUrl": "", "items": []}


def slug(text: str) -> str:
    """Chuẩn hóa để so khớp: bỏ dấu tiếng Việt, chữ thường, ký tự khác chữ/số thành '-'."""
    s = unicodedata.normalize("NFD", str(text)).replace("đ", "d").replace("Đ", "D")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^0-9a-z぀-ヿ一-鿿]+", "-", s).strip("-")


def list_sounds(kind: str | None = None, lib: Path | None = None, manifest: dict | None = None) -> list[dict]:
    lib = lib or library_dir()
    manifest = manifest if manifest is not None else load_manifest()
    pack_dir = lib / "pack" / manifest.get("version", "v1")
    out: list[dict] = []
    for it in manifest.get("items", []):
        if kind and it.get("kind") != kind:
            continue
        f = pack_dir / it["file"]
        ok = f.is_file() and f.stat().st_size == it.get("bytes")
        out.append({
            "id": it["id"], "kind": it["kind"], "name": it["name"], "category": it.get("category", ""),
            "source": "pack", "duration": it.get("duration"), "downloaded": ok, "path": str(f) if ok else None,
        })
    for k in KINDS:
        if kind and k != kind:
            continue
        d = lib / "my" / k
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            if f.suffix.lower() in AUDIO_EXTS and f.is_file():
                out.append({
                    "id": f"my-{k}-{f.name}", "kind": k, "name": f.stem, "category": "Của tôi",
                    "source": "mine", "duration": None, "downloaded": True, "path": str(f),
                })
    return out


def _download(item: dict, lib: Path, manifest: dict) -> Path:
    src = next(i for i in manifest["items"] if i["id"] == item["id"])
    dest = lib / "pack" / manifest.get("version", "v1") / src["file"]
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(manifest["baseUrl"] + src["file"], timeout=60) as resp:
        data = resp.read()
    if hashlib.sha256(data).hexdigest() != src["sha256"]:
        raise SoundNotFound(f"Tải '{src['name']}' thất bại: SHA-256 không khớp")
    dest.write_bytes(data)
    return dest


def find_sound(ref: str, kind: str | None = None, *, lib: Path | None = None, manifest: dict | None = None,
               download: bool = True) -> Path:
    """Tìm âm theo tên/mã trong thư viện (ưu tiên âm cá nhân), tải âm của gói nếu cần.

    Khớp chính xác theo mã, tên file hoặc tên hiển thị (không dấu); nếu không có thì khớp một phần
    khi chỉ có đúng một kết quả. Ném SoundNotFound kèm gợi ý khi không tìm được.
    """
    lib = lib or library_dir()
    manifest = manifest if manifest is not None else load_manifest()
    items = list_sounds(kind, lib, manifest)
    key = slug(Path(ref).stem if Path(ref).suffix.lower() in AUDIO_EXTS else ref)
    if not key:
        raise SoundNotFound("Tên âm trống")

    def keys(it: dict) -> set[str]:
        k = {slug(it["id"]), slug(it["name"])}
        if it["source"] == "pack":
            k.add(slug(it["id"].split("-", 1)[1]))  # "bgm-cong-vien" -> "cong-vien"
        if it.get("path"):
            k.add(slug(Path(it["path"]).stem))
        return k

    ordered = sorted(items, key=lambda it: it["source"] != "mine")  # âm cá nhân trước
    exact = [it for it in ordered if key in keys(it)]
    partial = [it for it in ordered if any(key in k or k in key for k in keys(it) if len(k) >= 3)]
    match = exact[0] if exact else (partial[0] if len({p["id"] for p in partial}) == 1 else None)
    if not match:
        names = ", ".join(sorted({it["name"] for it in (partial or items)})[:12])
        raise SoundNotFound(f"Không tìm thấy âm '{ref}'" + (f". Có: {names}" if names else ""))
    if match.get("path"):
        return Path(match["path"])
    if not download:
        raise SoundNotFound(f"Âm '{match['name']}' chưa được tải về")
    return _download(match, lib, manifest)


def parse_layer(spec: str, default_db: float) -> tuple[str, float]:
    """"mua@-22" -> ("mua", -22.0); không có @dB thì dùng default_db."""
    m = re.match(r"^(.*?)@(-?\d+(?:\.\d+)?)$", str(spec).strip())
    return (m[1], float(m[2])) if m else (str(spec).strip(), default_db)


def resolve_bgm(ref: str) -> Path:
    """File có thật thì dùng luôn; không thì tìm theo tên trong thư viện (kind=bgm)."""
    p = Path(ref)
    if p.is_file():
        return p
    return find_sound(ref, "bgm")
