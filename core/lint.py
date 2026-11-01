"""Kiểm tra kịch bản trước khi tạo âm thanh: lỗi chặn việc tạo, cảnh báo chỉ để xem."""
from __future__ import annotations

import re
from pathlib import Path

from core.models import LineItem, Project, SfxItem
from core.paths import sfx_path

_KANJI = re.compile(r"[一-鿿々]")


def lint_project(project: Project, base: Path) -> list[dict]:
    """Trả về danh sách {id, level: error|warning, message}."""
    issues: list[dict] = []
    for it in project.items:
        if isinstance(it, SfxItem):
            if not sfx_path(it.path, base).is_file():
                issues.append({"id": it.id, "level": "error",
                               "message": f"không tìm thấy file hiệu ứng: {it.path}"})
            continue
        if not isinstance(it, LineItem):
            continue
        if it.role not in project.roles:
            issues.append({"id": it.id, "level": "error",
                           "message": f"vai [{it.role}] chưa khai báo trong roles.yaml"})
        if not it.tts_text.strip():
            issues.append({"id": it.id, "level": "error", "message": "câu thoại trống"})
        if _KANJI.search(it.plain) and it.display == it.plain:
            # Chữ Hán chưa có {かな}: chỉ nhắc, vì phần lớn trường hợp pyopenjtalk đọc đúng.
            issues.append({"id": it.id, "level": "warning",
                           "message": "có chữ Hán chưa có cách đọc {かな}; nên kiểm tra"})
    return issues
