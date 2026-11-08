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


def apply_readings(text: str, readings: dict[str, str]) -> str:
    """Thêm `{かな}` vào các từ trong từ điển chưa có cách đọc riêng."""
    if not readings:
        return text
    words = sorted(readings, key=len, reverse=True)
    pattern = re.compile("(" + "|".join(re.escape(w) for w in words) + r")(?!\{)")
    return pattern.sub(lambda m: f"{m[1]}{{{readings[m[1]]}}}", text)


def save_readings(path: Path, readings: dict[str, str]) -> None:
    for word, kana in readings.items():
        if not word or not KANA_RE.match(kana):
            raise ValueError(f"Cách đọc của '{word}' phải là kana: {kana!r}")
    lines = [f"{word}: {kana}" for word, kana in sorted(readings.items())]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
