"""Xuất phiếu học tập HTML: câu thoại với furigana (<ruby>) để in ra dùng trong lớp."""
from __future__ import annotations

import html

from core.normalize import _HAS_KANJI, _clean_pron, _tokens, annotate_token
from core.parser import RUBY_RE, ruby_reading


def _auto_ruby(text: str) -> str:
    """Chú âm tự động cho các từ toàn Hán và từ có okurigana chưa có `{かな}` (pyopenjtalk)."""
    try:
        tokens = _tokens(text)
    except Exception:
        return html.escape(text)
    parts = []
    for surface, pron in tokens:
        if pron is not None and _HAS_KANJI.search(surface):
            ann = annotate_token(surface, pron)
            sub_parts, last = [], 0
            for m in RUBY_RE.finditer(ann):
                sub_parts.append(html.escape(ann[last:m.start()]))
                sub_parts.append(_ruby(m.group(1), ruby_reading(m)))
                last = m.end()
            sub_parts.append(html.escape(ann[last:]))
            parts.append("".join(sub_parts))
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
        out.append(_ruby(m.group(1), ruby_reading(m)))
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
td.tr { color: #444; font-size: 11pt; }
h2 { font-size: 14pt; margin-top: 1.6em; border-left: 4px solid #2563eb; padding-left: 8px; }
ol.questions > li { margin-bottom: 1em; }
.answers { page-break-before: always; }
.credits { margin-top: 2em; font-size: 9pt; color: #666; }
@media print { body { margin: 1cm; } }
"""


def worksheet_html(title: str, items: list[dict], *, roles: dict | None = None, vocab: list[dict] | None = None,
                   questions: list[dict] | None = None, credits: list[str] | None = None) -> str:
    """Phiếu học tập: hội thoại có furigana (+ bản dịch nếu có), từ vựng, câu hỏi nghe hiểu và đáp án.

    `items`: các mục của project (chỉ lấy câu thoại). `roles`: {mã vai: {name}} để in tên nhân vật.
    `vocab`: [{word, reading, meaning}]. `questions`: [{question, choices: [...], answer (1-based), explanation}].
    """
    has_tr = any(it.get("type") == "line" and it.get("translation") for it in items)
    rows = []
    for it in items:
        if it.get("type") != "line":
            continue
        who = (roles or {}).get(str(it["role"]), {})
        name = who.get("name") if isinstance(who, dict) else getattr(who, "name", "")
        tr = f"<td class=\"tr\">{html.escape(it.get('translation', ''))}</td>" if has_tr else ""
        rows.append(
            f"<tr><td>{html.escape(it['id'])}</td>"
            f"<td>{html.escape(name or '[' + str(it['role']) + ']')}</td>"
            f"<td class=\"text\">{ruby_html(it['display'])}</td>{tr}</tr>"
        )
    parts = [
        "<!DOCTYPE html>\n<html lang=\"ja\"><head><meta charset=\"utf-8\">"
        f"<title>{html.escape(title)}</title><style>{_STYLE}</style></head><body>\n"
        f"<h1>{html.escape(title)}</h1>\n",
        "<h2>Hội thoại</h2>\n<table><thead><tr><th>Mã</th><th>Vai</th><th>Câu thoại</th>"
        + ("<th>Dịch</th>" if has_tr else "") + "</tr></thead>\n"
        f"<tbody>\n{chr(10).join(rows)}\n</tbody></table>\n",
    ]
    if vocab:
        vr = "".join(
            f"<tr><td>{i}</td><td class=\"text\">{ruby_html(v.get('word', ''))}</td>"
            f"<td>{html.escape(v.get('reading', ''))}</td><td>{html.escape(v.get('meaning', ''))}</td></tr>"
            for i, v in enumerate(vocab, 1)
        )
        parts.append("<h2>Từ vựng</h2>\n<table><thead><tr><th>#</th><th>Từ</th><th>Cách đọc</th><th>Nghĩa</th></tr></thead>"
                     f"<tbody>{vr}</tbody></table>\n")
    if questions:
        qs, ans = [], []
        for i, q in enumerate(questions, 1):
            choices = "".join(f"<li>{ruby_html(c)}</li>" for c in q.get("choices", []))
            qs.append(f"<li class=\"q\"><div class=\"text\">{ruby_html(q.get('question', ''))}</div><ol>{choices}</ol></li>")
            a = q.get("answer")
            ans.append(f"<li>{html.escape(str(a)) if a else '—'}"
                       + (f" — {html.escape(q['explanation'])}" if q.get("explanation") else "") + "</li>")
        parts.append(f"<h2>Câu hỏi nghe hiểu</h2>\n<ol class=\"questions\">{''.join(qs)}</ol>\n"
                     f"<div class=\"answers\"><h2>Đáp án</h2><ol>{''.join(ans)}</ol></div>\n")
    if credits:
        parts.append("<p class=\"credits\">Âm thanh: " + "; ".join(html.escape(c) for c in credits) + "</p>\n")
    parts.append("</body></html>\n")
    return "".join(parts)
