"""Nhân vật cố định của giáo trình (vd. Minh, Yui, thầy Tanaka): giọng + cảm xúc + tốc độ + cao độ + mô tả.

Dùng chung file với "Mẫu vai" trong app: <userData>/presets.json
[{name, voice, emotion, speed, pitch, engine?, description?}]
"""
from __future__ import annotations

import json
from pathlib import Path

from core.appdata import user_data_dir
from core.sounds import slug


def characters_path() -> Path:
    return user_data_dir() / "presets.json"


def list_characters(engine: str | None = None, path: Path | None = None) -> list[dict]:
    try:
        data = json.loads((path or characters_path()).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    out = []
    for c in data if isinstance(data, list) else []:
        if not isinstance(c, dict) or not c.get("name") or not c.get("voice"):
            continue
        if engine and c.get("engine") and c["engine"] != engine:
            continue
        out.append({
            "name": str(c["name"]), "engine": c.get("engine", ""), "voice": str(c["voice"]),
            "emotion": c.get("emotion", "neutral"), "speed": c.get("speed", "normal"),
            "pitch": int(c.get("pitch", 0) or 0), "description": c.get("description", ""),
        })
    return out


def find_character(name: str, engine: str | None = None, path: Path | None = None) -> dict | None:
    key = slug(name)
    for c in list_characters(engine, path):
        if slug(c["name"]) == key:
            return c
    return None


def save_character(char: dict, path: Path | None = None) -> dict:
    """Tạo mới hoặc cập nhật nhân vật cố định theo tên trong presets.json."""
    target = path or characters_path()
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            data = []
    except (OSError, ValueError):
        data = []
    key = slug(char["name"])
    entry = {
        "name": str(char["name"]).strip(),
        "engine": char.get("engine") or "aivis",
        "voice": str(char["voice"]),
        "emotion": char.get("emotion") or "neutral",
        "speed": char.get("speed") or "normal",
        "pitch": int(char.get("pitch") or 0),
        "description": char.get("description") or "",
    }
    updated = False
    for i, item in enumerate(data):
        if isinstance(item, dict) and slug(item.get("name", "")) == key:
            data[i] = entry
            updated = True
            break
    if not updated:
        data.append(entry)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return entry


def delete_character(name: str, path: Path | None = None) -> bool:
    """Xóa nhân vật cố định theo tên khỏi presets.json. Trả về True nếu có xóa."""
    target = path or characters_path()
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            return False
    except (OSError, ValueError):
        return False
    key = slug(name)
    kept = [c for c in data if not (isinstance(c, dict) and slug(c.get("name", "")) == key)]
    if len(kept) == len(data):
        return False
    target.write_text(json.dumps(kept, ensure_ascii=False, indent=2), encoding="utf-8")
    return True
