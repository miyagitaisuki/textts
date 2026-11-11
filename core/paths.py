"""Tiện ích đường dẫn dùng chung giữa CLI và kiểm tra kịch bản."""
from __future__ import annotations

from pathlib import Path


def sfx_path(path: str, base: Path) -> Path:
    """Đường dẫn sfx: tương đối tính từ thư mục chứa kịch bản/project.json.

    Nếu không có file ở đó, coi `path` là tên âm trong thư viện (vd. [sfx=chuong-cua]) và tìm trong
    thư viện âm thanh của app; không tìm được thì trả về đường dẫn ban đầu để báo lỗi như cũ.
    """
    p = Path(path)
    candidate = p if p.is_absolute() else base / p
    if candidate.is_file():
        return candidate
    from core.sounds import SoundNotFound, find_sound

    try:
        return find_sound(path, "sfx")
    except (SoundNotFound, OSError):
        return candidate
