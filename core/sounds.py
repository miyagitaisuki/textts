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


def load_personal_index(lib: Path) -> dict:
    """Mô tả do giáo viên ghi cho âm cá nhân: my/index.json {"bgm/ten.mp3": {"description", "tags"}}."""
    try:
        data = json.loads((lib / "my" / "index.json").read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def list_sounds(kind: str | None = None, lib: Path | None = None, manifest: dict | None = None) -> list[dict]:
    lib = lib or library_dir()
    manifest = manifest if manifest is not None else load_manifest()
    personal = load_personal_index(lib)
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
            "description": it.get("description", ""), "tags": it.get("tags", []), "related": it.get("related", []),
        })
    for k in KINDS:
        if kind and k != kind:
            continue
        d = lib / "my" / k
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            if f.suffix.lower() in AUDIO_EXTS and f.is_file():
                meta = personal.get(f"{k}/{f.name}", {})
                tags = meta.get("tags", [])
                out.append({
                    "id": f"my-{k}-{f.name}", "kind": k, "name": f.stem, "category": "Của tôi",
                    "source": "mine", "duration": None, "downloaded": True, "path": str(f),
                    "description": str(meta.get("description", "")),
                    "tags": [str(t) for t in tags] if isinstance(tags, list) else [],
                    "related": [str(t) for t in meta.get("related", [])] if isinstance(meta.get("related"), list) else [],
                    "credit": str(meta.get("credit", "")),
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
        near = search_sounds(ref, kind, lib=lib, manifest=manifest)[:5]
        if near:
            hint = "; ".join(f"{ref_of(n)} ({n['name']}, {n['match']})" for n in near)
            raise SoundNotFound(f"Không có âm '{ref}'. Âm gần nhất có thể dùng tạm: {hint}")
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


def ref_of(item: dict) -> str:
    """Tên ngắn dùng trong options.bgm / [sfx=...]: mã gói bỏ tiền tố, hoặc tên file cá nhân."""
    return item["id"].split("-", 1)[1] if item["source"] == "pack" else item["name"]


STOPWORDS = {"tiếng", "âm", "thanh", "cái", "của", "có", "và", "ở", "trong", "ngoài", "đang", "một", "những",
             "các", "kiểu", "loại", "nhạc", "nền", "sound", "the", "a"}


def _vi_words(text: str, keep_marks: bool) -> list[str]:
    """Tách âm tiết; keep_marks=False thì bỏ dấu (khi người gõ không dấu)."""
    t = unicodedata.normalize("NFC", str(text)).lower()
    if not keep_marks:
        t = slug(t).replace("-", " ")
    return [w for w in re.split(r"[^\w]+", t) if w and w not in STOPWORDS]


def _grams(words: list[str]) -> set[str]:
    """Cụm 1-3 âm tiết liền nhau ("sấm", "sấm động", "ô tô")."""
    return {" ".join(words[i:i + n]) for n in (1, 2, 3) for i in range(len(words) - n + 1)}


def search_sounds(query: str, kind: str | None = None, *, lib: Path | None = None,
                  manifest: dict | None = None) -> list[dict]:
    """Tìm âm theo nghĩa trong mục lục (tên, mô tả, từ khóa, "dùng tạm cho"). Không cần nghe file.

    Mỗi kết quả có 'match': "khớp" (đúng âm cần tìm) hoặc "gần đúng" (âm gần giống, dùng tạm được,
    ví dụ cần tiếng sấm nhưng chỉ có tiếng mưa). Kết quả xếp theo độ phù hợp.
    So khớp theo cụm âm tiết, giữ dấu tiếng Việt (gõ không dấu thì so không dấu).
    """
    marks = slug(query).replace("-", "") != re.sub(r"[^0-9a-z]", "", str(query).lower())
    qw = _vi_words(query, marks)
    if not qw:
        return []
    qg = _grams(qw)
    full = " ".join(qw)

    def score(fields: list[str]) -> int:
        best = 0
        for f in fields:
            fw = _vi_words(f, marks)
            if not fw:
                continue
            fg = _grams(fw)
            if full == " ".join(fw) or full in fg:
                best = max(best, 10 + len(qw))  # cả cụm truy vấn có trong trường
            elif " ".join(fw) in qg:
                best = max(best, 5 + 2 * len(fw))  # cả trường (vd. từ khóa "sấm") nằm trong truy vấn
            else:
                hit = [g for g in qg & fg if " " in g or len(qw) == 1]  # 1 âm tiết chỉ tính khi truy vấn ngắn
                if hit:
                    best = max(best, 3 * max(len(g.split()) for g in hit))
                elif len(qw) > 1:
                    best = max(best, len(set(qw) & set(fw)))  # vài âm tiết rời: điểm thấp
        return best

    results = []
    for it in list_sounds(kind, lib, manifest):
        direct = score([it["name"], *it.get("tags", []), Path(it["path"]).stem if it.get("path") else ""])
        desc = score([it.get("description", "")])
        related = score(it.get("related", []))
        direct = max(direct, desc - 1)
        if direct >= 3 or related >= 3:
            results.append({**it, "ref": ref_of(it), "score": max(direct * 2, related),
                            "match": "khớp" if direct >= 3 and direct * 2 >= related else "gần đúng"})
    return sorted(results, key=lambda r: (-r["score"], r["source"] != "mine", r["name"]))


def catalog_text(lib: Path | None = None, manifest: dict | None = None) -> str:
    """Mục lục thư viện dạng văn bản cho Claude/AI khác đọc (không cần nghe file)."""
    items = list_sounds(None, lib, manifest)
    lines = [
        "# Mục lục thư viện âm thanh textts",
        "",
        "Dùng 'ref' cho options.bgm (âm nền, chồng được nhiều lớp) hoặc dòng [sfx=<ref>] trong kịch bản.",
        "Không có âm đúng thì chọn âm có \"Dùng tạm cho\" gần nhất và báo người dùng là đang dùng tạm.",
        "",
    ]
    for kind, title in (("bgm", "Nhạc / âm nền (bgm)"), ("sfx", "Hiệu ứng (sfx)")):
        group = [i for i in items if i["kind"] == kind]
        if not group:
            continue
        lines += [f"## {title}", "", "| ref | Tên | Mô tả | Từ khóa | Dùng tạm cho | Nguồn |", "|---|---|---|---|---|---|"]
        for i in group:
            source = (i.get("credit") or "giáo viên") if i["source"] == "mine" else "gói textts (CC0)"
            cells = [ref_of(i), i["name"], i.get("description") or "(chưa có mô tả)", ", ".join(i.get("tags", [])),
                     ", ".join(i.get("related", [])), source]
            lines.append("| " + " | ".join(c.replace("|", "/") for c in cells) + " |")
        lines.append("")
    return "\n".join(lines)


def credits_for(paths: list[str | Path], lib: Path | None = None) -> list[str]:
    """Dòng ghi công cho các âm cá nhân có ghi 'credit' (vd. 'OtoLogic (CC BY 4.0)') đã dùng trong bài."""
    lib = lib or library_dir()
    personal = load_personal_index(lib)
    out: list[str] = []
    for p in paths:
        p = Path(p)
        try:
            rel = p.resolve().relative_to((lib / "my").resolve()).as_posix()
        except (ValueError, OSError):
            continue
        credit = str(personal.get(rel, {}).get("credit", "")).strip()
        if credit:
            line = f"{p.stem}: {credit}"
            if line not in out:
                out.append(line)
    return out
