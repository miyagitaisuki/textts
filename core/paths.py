"""Tiện ích đường dẫn dùng chung giữa CLI và kiểm tra kịch bản."""
from __future__ import annotations

from pathlib import Path


def sfx_path(path: str, base: Path) -> Path:
    """Đường dẫn sfx tương đối được tính từ thư mục chứa kịch bản/project.json."""
    p = Path(path)
    return p if p.is_absolute() else base / p
