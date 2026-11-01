from core.worksheet import ruby_html, worksheet_html


def test_explicit_reading_is_used():
    assert ruby_html("漢字{かんじ}を読みます") == "<ruby>漢字<rt>かんじ</rt></ruby>を読みます"


def test_auto_reading_for_plain_kanji():
    out = ruby_html("日本語を勉強します")
    assert "<ruby>日本語<rt>にほんご</rt></ruby>" in out
    assert "<ruby>勉強<rt>べんきょう</rt></ruby>" in out


def test_html_is_escaped():
    assert ruby_html("<b>&") == "&lt;b&gt;&amp;"


def test_worksheet_skips_non_line_items():
    doc = worksheet_html("Bài 10", [
        {"id": "L001", "type": "line", "role": "1", "display": "こんにちは"},
        {"id": "P001", "type": "pause", "ms": 500},
    ])
    assert doc.count("<tr>") == 2  # 1 hàng tiêu đề + 1 câu
    assert "こんにちは" in doc
