"""Phân tích kịch bản hội thoại tiếng Nhật thành danh sách câu và khoảng lặng.

Cú pháp:
    # ghi chú
    [1] すみません、駅{えき}はどこですか。
    [2]{emotion=happy, speed=slow} あ、駅ですか。
        (dòng thụt đầu: nối vào câu trước)
    [pause=1500]

Đạo diễn (thuộc tính trong {...} của câu):
    emotion=happy|sad|angry|surprised, speed=slow|fast, pitch=-20..20
    fx=phone|whisper|far|radio|echo   hiệu ứng giọng (qua điện thoại, thì thầm, ở xa, loa thông báo, vang)
    vol=-6                            to/nhỏ hơn (dB)
    overlap=400                       nói chen: bắt đầu trước khi câu trước kết thúc 400 ms
    accent=2/0                        (AivisSpeech) vị trí accent từng cụm, 0 = bằng; số cụm phải khớp câu
Bản dịch: [1] こんにちは。 // Xin chào.
Cảnh & hiệu ứng:
    [sfx=chuong-cua]                  chèn hiệu ứng (chiếm thời gian)
    [sfx=chuong-cua, overlay, vol=-6] chồng lên câu kế tiếp
    [bgm=quan-ca-phe]                 đổi âm nền từ đây; nhiều lớp: [bgm=mua+duong-pho@-26]; tắt: [bgm=off]

Cũng nhận dạng dạng rút gọn không có ngoặc, khi số đứng ngay đầu dòng:
    1 すみません、駅はどこですか。
    2: はい、あちらです。
"""
from __future__ import annotations

import re

from core.readings import apply_readings

LINE_RE = re.compile(r"^\s*\[(\d+)\]\s*(?:\{([^}]*)\})?\s*(.*)$")
# Dạng rút gọn: số vai ở đầu dòng (không thụt), sau đó là khoảng trắng hoặc dấu : ： . 、
BARE_LINE_RE = re.compile(r"^(\d+)[ \t:：.、]+(.+)$")
PAUSE_RE = re.compile(r"^\s*\[\s*pause\s*=\s*(\d+)\s*\]\s*$", re.I)
SFX_RE = re.compile(r"^\s*\[\s*sfx\s*=\s*(.+?)\s*\]\s*$", re.I)
BGM_RE = re.compile(r"^\s*\[\s*bgm\s*=\s*(.*?)\s*\]\s*$", re.I)
TRANSLATION_SEP = " // "
# 漢字{かな}, 漢字(かな) hoặc 漢字（かな）: giữ chữ Hán để hiển thị, gửi kana cho engine.
# Chỉ nhận khi trong ngoặc toàn là kana và ngay trước ngoặc là chữ Hán, để không nuốt ghi chú thường.
RUBY_RE = re.compile(r"([一-鿿々]+)(?:\{([぀-ヿー]+)\}|[(（]([぀-ヿー]+)[)）])")


def ruby_reading(m: "re.Match[str]") -> str:
    """Phần kana của một chú âm khớp RUBY_RE (dù viết bằng ngoặc nhọn hay ngoặc tròn)."""
    return m[2] or m[3]


def to_tts_text(display: str) -> str:
    """Chuỗi gửi engine: thay mỗi 漢字(かな) bằng phần kana."""
    return RUBY_RE.sub(ruby_reading, display)


def to_plain(display: str) -> str:
    """Bản không furigana (cho phụ đề): bỏ phần chú âm."""
    return RUBY_RE.sub(r"\1", display)


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


def parse_sfx(spec: str, line_no: int) -> dict:
    """"chuong-cua, overlay, vol=-6" -> {"path": "chuong-cua", "overlay": True, "volume_db": -6.0}."""
    parts = [p.strip() for p in spec.split(",")]
    out: dict = {"path": parts[0]}
    for p in parts[1:]:
        low = p.lower()
        if low in ("overlay", "chong", "chồng"):
            out["overlay"] = True
        elif low.startswith(("vol=", "volume=")):
            try:
                out["volume_db"] = float(low.split("=", 1)[1])
            except ValueError:
                raise ScriptError(f"Dòng {line_no}: âm lượng không hợp lệ: {p}") from None
        elif p:
            raise ScriptError(f"Dòng {line_no}: tùy chọn sfx không rõ: {p} (dùng overlay, vol=-6)")
    return out


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
            items.append({"type": "sfx", "src_line": line_no, **parse_sfx(m[1], line_no)})
            cur = None
        elif m := BGM_RE.match(raw):
            spec = m[1].strip()
            layers = [] if spec.lower() in ("", "off", "none", "tat", "tắt") else [x.strip() for x in spec.split("+") if x.strip()]
            items.append({"type": "bgm", "layers": layers, "src_line": line_no})
            cur = None
        elif m := LINE_RE.match(raw):
            attrs = parse_attrs(m[2])
            if "accent" in attrs and not re.match(r"^\d+(/\d+)*$", attrs["accent"]):
                raise ScriptError(f"Dòng {line_no}: accent phải dạng 2 hoặc 2/0, nhận được: {attrs['accent']}")
            cur = {
                "type": "line",
                "role": m[1],
                "attrs": attrs,
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
            text, sep, tr = it["text"].partition(TRANSLATION_SEP)
            if sep:
                it["text"] = text.strip()
                it["translation"] = tr.strip()
            it["display"] = apply_readings(it["text"], readings or {})  # giữ furigana để hiển thị
            it["tts_text"] = to_tts_text(it["display"])  # gửi kana cho engine
            it["plain"] = to_plain(it["display"])        # bản không furigana cho phụ đề
    return items


def roles_used(items: list[dict]) -> set[str]:
    return {it["role"] for it in items if it["type"] == "line"}
