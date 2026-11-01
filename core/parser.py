"""Phân tích kịch bản hội thoại tiếng Nhật thành danh sách câu và khoảng lặng.

Cú pháp:
    # ghi chú
    [1] すみません、駅{えき}はどこですか。
    [2]{emotion=happy, speed=slow} あ、駅ですか。
        (dòng thụt đầu: nối vào câu trước)
    [pause=1500]

Cũng nhận dạng dạng rút gọn không có ngoặc, khi số đứng ngay đầu dòng:
    1 すみません、駅はどこですか。
    2: はい、あちらです。
"""
from __future__ import annotations

import re

from core.readings import apply_readings

LINE_RE = re.compile(r"^\s*\[(\d+)\]\s*(?:\{([^}]*)\})?\s*(.*)$")
# Dạng rút gọn: số vai ở đầu dòng (không thụt), sau đó là khoảng trắng hoặc dấu : ： . 、
BARE_LINE_RE = re.compile(r"^(\d)[ \t:：.、]+(.+)$")
PAUSE_RE = re.compile(r"^\s*\[\s*pause\s*=\s*(\d+)\s*\]\s*$", re.I)
SFX_RE = re.compile(r"^\s*\[\s*sfx\s*=\s*(.+?)\s*\]\s*$", re.I)
# 漢字{かな}: giữ chữ Hán để hiển thị, gửi kana cho engine
RUBY_RE = re.compile(r"([一-鿿々]+)\{([぀-ヿー]+)\}")


class ScriptError(ValueError):
    """Lỗi cú pháp kịch bản, kèm số dòng để giáo viên sửa."""


def parse_attrs(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    attrs: dict[str, str] = {}
    for part in raw.split(","):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        attrs[k.strip()] = v.strip()
    return attrs


def parse_script(text: str, readings: dict[str, str] | None = None) -> list[dict]:
    items: list[dict] = []
    cur: dict | None = None
    for line_no, raw in enumerate(text.splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if m := PAUSE_RE.match(raw):
            items.append({"type": "pause", "ms": int(m[1]), "src_line": line_no})
            cur = None
        elif m := SFX_RE.match(raw):
            items.append({"type": "sfx", "path": m[1], "src_line": line_no})
            cur = None
        elif m := LINE_RE.match(raw):
            cur = {
                "type": "line",
                "role": m[1],
                "attrs": parse_attrs(m[2]),
                "text": m[3].strip(),
                "src_line": line_no,
            }
            items.append(cur)
        elif m := BARE_LINE_RE.match(raw):
            cur = {
                "type": "line",
                "role": m[1],
                "attrs": {},
                "text": m[2].strip(),
                "src_line": line_no,
            }
            items.append(cur)
        elif raw.lstrip().startswith("["):
            # Thẻ không hợp lệ (ví dụ [pause=abc]): báo lỗi, không nuốt vào lời thoại
            raise ScriptError(f"Dòng {line_no}: thẻ không hợp lệ: {raw.strip()}")
        elif cur is not None:  # dòng nối tiếp
            cur["text"] += raw.strip()
        else:
            raise ScriptError(f"Dòng {line_no}: thiếu thẻ vai [1]/[2]/[3]")

    lines_only = [it for it in items if it["type"] == "line"]
    if not lines_only:
        raise ScriptError("Kịch bản không có câu thoại nào")

    for i, it in enumerate(items):
        it["id"] = f"L{i + 1:03d}"
        if it["type"] == "line":
            it["display"] = apply_readings(it["text"], readings or {})  # giữ furigana để hiển thị
            it["tts_text"] = RUBY_RE.sub(r"\2", it["display"])  # gửi kana cho engine
            it["plain"] = RUBY_RE.sub(r"\1", it["display"])     # bản không furigana cho phụ đề
    return items


def roles_used(items: list[dict]) -> set[str]:
    return {it["role"] for it in items if it["type"] == "line"}
