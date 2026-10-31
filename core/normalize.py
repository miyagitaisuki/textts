"""Gợi ý cách đọc tiếng Nhật cho giáo viên kiểm tra trước khi tổng hợp.

Dùng pyopenjtalk (giấy phép MIT, chạy offline). Chỉ là gợi ý: không ảnh hưởng đến
cách đọc thực tế, trừ khi giáo viên áp dụng và ghi `漢字{かな}` vào kịch bản.

Chạy như tiến trình con từ giao diện:
    echo '["駅はどこ"]' | python -m core.normalize
    -> [{"reading": "えきはどこ", "annotated": "駅{えき}はどこ"}]
"""
from __future__ import annotations

import json
import re
import sys

from core.parser import RUBY_RE

_KANJI_ONLY = re.compile(r"^[一-鿿々]+$")
_HAS_KANJI = re.compile(r"[一-鿿々]")
_KATA = re.compile(r"[ァ-ヶ]")


def to_hiragana(s: str) -> str:
    return _KATA.sub(lambda m: chr(ord(m.group()) - 0x60), s)


def _tokens(text: str):
    """Tách từ và trả về (chuỗi gốc, cách đọc katakana) theo đúng thứ tự xuất hiện."""
    import pyopenjtalk  # import muộn: nạp từ điển tốn thời gian

    out, pos = [], 0
    for t in pyopenjtalk.run_frontend(text):
        surface = t["string"]
        idx = text.find(surface, pos)
        if idx < 0:  # token không khớp văn bản gốc: bỏ qua, giữ nguyên ký tự
            continue
        out.append((text[pos:idx], None))  # ký tự bị bỏ sót giữa các token, giữ nguyên
        out.append((surface, t.get("pron") or ""))
        pos = idx + len(surface)
    out.append((text[pos:], None))
    return out


# Nguyên âm của từng kana, dùng để đổi dấu kéo dài ー thành kana tương ứng.
_VOWELS = {
    "あぁかがさざただだなはばぱまゃやらわゎ": "あ",
    "いぃきぎしじちぢにひびぴみり": "い",
    "うぅくぐすずつづぬふぶぷむゅゆるゔ": "う",
    "えぇけげせぜてでねへべぺめれ": "え",
    "おぉこごそぞとどのほぼぽもょよろを": "お",
}
_VOWEL_OF = {ch: v for chars, v in _VOWELS.items() for ch in chars}


# Quy tắc kéo dài chuẩn: おー -> おう, えー -> えい; các hàng khác lặp nguyên âm.
_LONG_OF = {"お": "う", "え": "い"}


def _long_vowels(hira: str) -> str:
    """ほんとーに -> ほんとうに, とーきょー -> とうきょう."""
    out = []
    for ch in hira:
        if ch == "ー" and out and out[-1] in _VOWEL_OF:
            v = _VOWEL_OF[out[-1]]
            out.append(_LONG_OF.get(v, v))
        else:
            out.append(ch)
    return "".join(out)


def _clean_pron(pron: str) -> str:
    return _long_vowels(to_hiragana(pron.replace("’", "").replace("'", "").replace("、", "")))


def reading(text: str) -> str:
    """Cách đọc gợi ý của cả câu, giữ nguyên dấu câu và chữ kana.

    Chú âm `漢字{かな}` được dùng đúng như kana đã ghi, không đoán lại.
    """
    text = RUBY_RE.sub(r"\2", text)
    parts = []
    for surface, pron in _tokens(text):
        if pron is None or not _HAS_KANJI.search(surface):
            parts.append(surface)  # dấu câu, khoảng trắng, chữ kana: giữ nguyên
        else:
            parts.append(_clean_pron(pron))
    return "".join(parts)


def annotate(text: str) -> str:
    """Thêm `{かな}` cho các từ toàn chữ Hán chưa được chú âm.

    Từ lẫn Hán-kana (ví dụ 久しぶり) không tự chú âm được vì cú pháp hiện tại chỉ
    hỗ trợ chữ Hán đứng ngay trước `{`. Giữ nguyên chỗ đó để giáo viên sửa tay.
    """
    result = []
    last = 0
    # Giữ nguyên các chỗ đã có chú âm
    for m in RUBY_RE.finditer(text):
        result.append(_annotate_plain(text[last:m.start()]))
        result.append(m.group())
        last = m.end()
    result.append(_annotate_plain(text[last:]))
    return "".join(result)


def _annotate_plain(text: str) -> str:
    if not text:
        return text
    parts = []
    for surface, pron in _tokens(text):
        if pron is not None and _KANJI_ONLY.match(surface):
            parts.append(f"{surface}{{{_clean_pron(pron)}}}")
        else:
            parts.append(surface)
    return "".join(parts)


def main() -> int:
    items = json.loads(sys.stdin.read() or "[]")
    out = [{"reading": reading(t), "annotated": annotate(t)} for t in items]
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
