"""Ngân hàng giọng do giáo viên ghi chú trong app (biệt danh, giới tính, tuổi, chất giọng, mô tả).

AI đọc để chọn giọng hợp vai: search_voices("bé gái 8 tuổi vui tươi", engine="aivis").
File: <userData>/voice-bank.json (gui/electron/voice-bank.cjs ghi).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from core.appdata import user_data_dir
from core.sounds import _grams, _vi_words, slug

FEMALE = {"nữ", "con gái", "bé gái", "cô", "chị", "bà", "mẹ", "phụ nữ", "cô gái", "nu", "女", "female"}
MALE = {"nam", "con trai", "bé trai", "anh", "chú", "ông", "bố", "đàn ông", "chàng", "男", "male"}
# Từ chỉ lứa tuổi -> khoảng tuổi ước lượng
AGE_WORDS = [
    ({"trẻ con", "em bé", "bé", "trẻ em", "nhi đồng", "bé gái", "bé trai", "con nít"}, (3, 11)),
    ({"học sinh", "thiếu niên", "cấp 2", "cấp 3"}, (12, 18)),
    ({"sinh viên", "thanh niên", "trẻ", "cô gái", "chàng trai", "anh", "chị"}, (18, 30)),
    ({"người lớn", "nhân viên", "giáo viên", "cô", "chú", "bố", "mẹ"}, (28, 50)),
    ({"trung niên"}, (40, 60)),
    ({"người già", "ông", "bà", "cụ", "già", "lão"}, (60, 90)),
]


def bank_path() -> Path:
    return user_data_dir() / "voice-bank.json"


def load_bank(path: Path | None = None) -> dict[str, dict]:
    try:
        data = json.loads((path or bank_path()).read_text(encoding="utf-8"))
        voices = data.get("voices", {})
        return voices if isinstance(voices, dict) else {}
    except (OSError, ValueError):
        return {}


def list_voices(engine: str | None = None, path: Path | None = None, include_hidden: bool = False) -> list[dict]:
    out = []
    for key, m in load_bank(path).items():
        eng, _, voice = key.partition(":")
        if engine and eng != engine:
            continue
        if m.get("hidden") and not include_hidden:
            continue
        out.append({
            "engine": eng, "voice": voice, "label": m.get("label", ""), "nickname": m.get("nickname", ""),
            "gender": m.get("gender", ""), "age": m.get("age"), "styles": m.get("styles", []),
            "description": m.get("description", ""), "favorite": bool(m.get("favorite")),
        })
    return sorted(out, key=lambda v: (not v["favorite"], v["engine"], v["label"]))


def _contains(text_grams: set[str], words: set[str], marks: bool) -> bool:
    return any(" ".join(_vi_words(w, marks)) in text_grams for w in words)


def search_voices(query: str, engine: str | None = None, path: Path | None = None) -> list[dict]:
    """Xếp giọng theo mức hợp với mô tả vai: giới tính, tuổi (số hoặc lứa tuổi), chất giọng, mô tả."""
    marks = slug(query).replace("-", "") != re.sub(r"[^0-9a-z]", "", str(query).lower())
    qw = _vi_words(query, marks)
    qg = _grams(qw)
    want_gender = "nữ" if _contains(qg, FEMALE, marks) else "nam" if _contains(qg, MALE, marks) else ""
    m = re.search(r"(\d{1,3})\s*(tuổi|t\b|歳|years?)", str(query).lower())
    want_age: tuple[int, int] | None = (int(m[1]) - 2, int(m[1]) + 2) if m else None
    if not want_age:
        for words, rng in AGE_WORDS:
            if _contains(qg, words, marks):
                want_age = rng
                break

    results = []
    for v in list_voices(engine, path):
        score = 0.0
        why = []
        if want_gender:
            if v["gender"] == want_gender:
                score += 4
                why.append(v["gender"])
            elif v["gender"]:
                score -= 6  # sai giới tính: đẩy xuống cuối
        if want_age and isinstance(v["age"], (int, float)):
            lo, hi = want_age
            dist = 0 if lo <= v["age"] <= hi else min(abs(v["age"] - lo), abs(v["age"] - hi))
            score += max(-4, 4 - dist / 3)
            why.append(f"{v['age']} tuổi")
        fields = [v["nickname"], v["label"], v["description"], *v["styles"]]
        for f in fields:
            fg = _grams(_vi_words(f, marks))
            hits = [g for g in qg & fg if g not in {want_gender}]
            if hits:
                score += 2 * max(len(h.split()) for h in hits)
                why.extend(h for h in hits if h not in why)
        if v["favorite"]:
            score += 0.5
        if score > 0:
            results.append({**v, "score": round(score, 2), "why": why})
    return sorted(results, key=lambda r: -r["score"])
