"""Xuất phiếu học tập HTML: câu thoại với furigana (<ruby>) để in ra dùng trong lớp."""
from __future__ import annotations

import html

from core.normalize import _HAS_KANJI, _KANJI_ONLY, _clean_pron, _tokens
from core.parser import RUBY_RE


def _auto_ruby(text: str) -> str:
    """Chú âm tự động cho các từ toàn Hán chưa có `{かな}` (pyopenjtalk)."""
    parts = []
    for surface, pron in _tokens(text):
        if pron is not None and _KANJI_ONLY.match(surface):
            parts.append(_ruby(surface, _clean_pron(pron)))
        else:
            parts.append(html.escape(surface))
    return "".join(parts)


def _ruby(base: str, kana: str) -> str:
    return f"<ruby>{html.escape(base)}<rt>{html.escape(kana)}</rt></ruby>"


def _segment(text: str) -> str:
    if not text:
        return ""
    return _auto_ruby(text) if _HAS_KANJI.search(text) else html.escape(text)


def ruby_html(display: str) -> str:
    """Chuyển chữ hiển thị của một câu thành HTML có furigana.

    Chữ Hán có `{かな}` dùng đúng cách đọc đó; phần còn lại được chú âm tự động.
    """
    out, last = [], 0
    for m in RUBY_RE.finditer(display):
        out.append(_segment(display[last:m.start()]))
        out.append(_ruby(m.group(1), m.group(2)))
        last = m.end()
    out.append(_segment(display[last:]))
    return "".join(out)


_STYLE = """
body { font-family: "Noto Sans JP", "Yu Gothic", sans-serif; margin: 2em; color: #111; }
h1 { font-size: 20pt; }
table { width: 100%; border-collapse: collapse; }
th, td { border-bottom: 1px solid #999; padding: 8px; text-align: left; vertical-align: top; }
td.text { font-size: 18pt; line-height: 2.2; }
ruby rt { font-size: 0.5em; }
@media print { body { margin: 1cm; } }
"""


def worksheet_html(title: str, items: list[dict]) -> str:
    """`items` là danh sách mục của project (chỉ lấy các câu thoại, type == "line")."""
    rows = []
    for it in items:
        if it.get("type") != "line":
            continue
        rows.append(
            f"<tr><td>{html.escape(it['id'])}</td>"
            f"<td>[{html.escape(str(it['role']))}]</td>"
            f"<td class=\"text\">{ruby_html(it['display'])}</td></tr>"
        )
    return (
        "<!DOCTYPE html>\n<html lang=\"ja\"><head><meta charset=\"utf-8\">"
        f"<title>{html.escape(title)}</title><style>{_STYLE}</style></head><body>\n"
        f"<h1>{html.escape(title)}</h1>\n"
        "<table><thead><tr><th>Mã</th><th>Vai</th><th>Câu thoại</th></tr></thead>\n"
        f"<tbody>\n{chr(10).join(rows)}\n</tbody></table>\n</body></html>\n"
    )
