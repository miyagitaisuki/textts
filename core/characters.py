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
