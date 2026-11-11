"""Tìm thư mục dữ liệu của app textts (Electron userData) để server/MCP dùng chung cấu hình với giao diện.

App truyền đường dẫn qua biến môi trường khi tự khởi động server. Khi server được Claude Desktop (MCP)
khởi động trực tiếp, ta dò các vị trí mặc định của Electron trên từng hệ điều hành.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

APP_NAMES = ("textts", "textts-gui")  # productName khi đóng gói / name khi chạy dev


def _appdata_roots() -> list[Path]:
    home = Path.home()
    if sys.platform == "win32":
        base = os.environ.get("APPDATA")
        return [Path(base)] if base else [home / "AppData" / "Roaming"]
    if sys.platform == "darwin":
        return [home / "Library" / "Application Support"]
    return [Path(os.environ.get("XDG_CONFIG_HOME") or home / ".config")]


def user_data_dir() -> Path:
    """Thư mục userData của app; ưu tiên biến môi trường, sau đó thư mục đã có dữ liệu, cuối cùng là mặc định."""
    env = os.environ.get("TEXTTS_USER_DATA")
    if env:
        return Path(env)
    candidates = [root / name for root in _appdata_roots() for name in APP_NAMES]
    existing = [c for c in candidates if (c / "config.json").is_file() or (c / "sound-library").is_dir()]
    if existing:
        return max(existing, key=lambda p: p.stat().st_mtime)
    return candidates[0]


def output_root() -> Path | None:
    """Thư mục xuất người dùng đã chọn trong app (config.json), nếu còn tồn tại."""
    try:
        raw = json.loads((user_data_dir() / "config.json").read_text(encoding="utf-8")).get("outputRoot")
    except (OSError, ValueError):
        return None
    if isinstance(raw, str) and raw and Path(raw).is_dir():
        return Path(raw)
    return None
