"""Từ điển cách đọc do giáo viên quản lý (readings.yaml): từ Hán -> kana.

Áp dụng khi nhập kịch bản: mỗi lần từ xuất hiện mà chưa có `{かな}` sẽ được thêm
cách đọc trong từ điển. Ưu tiên từ dài hơn khi các từ chồng lên nhau.
"""
from __future__ import annotations

import re
from pathlib import Path

import yaml

KANA_RE = re.compile(r"^[぀-ヿー]+$")


def load_readings(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path}: cần là bảng 'từ: cách đọc'")
    readings: dict[str, str] = {}
    for word, kana in data.items():
        word, kana = str(word).strip(), str(kana).strip()
        if not word or not KANA_RE.match(kana):
            raise ValueError(f"{path}: cách đọc của '{word}' phải là kana: {kana!r}")
        readings[word] = kana
    return readings


BRACKET_OR_RUBY = re.compile(r"[一-鿿々]+\{[^}]*\}|\{[^}]*\}")


def apply_readings(text: str, readings: dict[str, str]) -> str:
    """Thêm `{かな}` vào các từ trong từ điển chưa có cách đọc riêng.
    
    Bảo vệ các đoạn đã có chú âm hoặc nằm trong ngoặc nhọn, tránh chèn lồng làm lặp âm.
    """
    if not readings or not text:
        return text
    words = sorted(readings, key=len, reverse=True)
    pattern = re.compile("(" + "|".join(re.escape(w) for w in words) + r")(?!\{)")
    parts = []
    last = 0
    for m in BRACKET_OR_RUBY.finditer(text):
        chunk = text[last:m.start()]
        if chunk:
            parts.append(pattern.sub(lambda sm: f"{sm[1]}{{{readings[sm[1]]}}}", chunk))
        parts.append(m.group())
        last = m.end()
    chunk = text[last:]
    if chunk:
        parts.append(pattern.sub(lambda sm: f"{sm[1]}{{{readings[sm[1]]}}}", chunk))
    return "".join(parts)


def save_readings(path: Path, readings: dict[str, str]) -> None:
    for word, kana in readings.items():
        if not word or not KANA_RE.match(kana):
            raise ValueError(f"Cách đọc của '{word}' phải là kana: {kana!r}")
    lines = [f"{word}: {kana}" for word, kana in sorted(readings.items())]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def load_engine_dict(path: Path) -> dict[str, tuple[str, int]]:
    """Từ điển riêng cho engine (aivis_dict.yaml): từ -> {reading: kana, accent: số mora}."""
    if not path.is_file():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path}: cần là bảng 'từ: {{reading: kana, accent: số}}'")
    out: dict[str, tuple[str, int]] = {}
    for word, entry in data.items():
        word = str(word).strip()
        if not isinstance(entry, dict) or "reading" not in entry or "accent" not in entry:
            raise ValueError(f"{path}: '{word}' cần có reading và accent")
        reading = str(entry["reading"]).strip()
        accent = int(entry["accent"])
        if not KANA_RE.match(reading) or accent < 0:
            raise ValueError(f"{path}: '{word}' có reading/accent không hợp lệ")
        out[word] = (reading, accent)
    return out
