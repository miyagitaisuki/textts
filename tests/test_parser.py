import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.parser import ScriptError, parse_attrs, parse_script  # noqa: E402


def test_basic_lines_and_ids():
    items = parse_script("[1] こんにちは。\n[2] はい。")
    assert [it["id"] for it in items] == ["L001", "L002"]
    assert [it["role"] for it in items] == ["1", "2"]
    assert items[0]["text"] == "こんにちは。"


def test_comments_and_blank_lines_skipped():
    items = parse_script("# ghi chú\n\n[1] こんにちは。\n   # vẫn là ghi chú\n")
    assert len(items) == 1


def test_attrs_override_are_parsed():
    items = parse_script("[2]{emotion=happy, speed=slow} はい。")
    assert items[0]["attrs"] == {"emotion": "happy", "speed": "slow"}


def test_ruby_furigana_split_into_display_tts_and_plain():
    items = parse_script("[1] すみません、駅{えき}はどこですか。")
    it = items[0]
    assert it["display"] == "すみません、駅{えき}はどこですか。"
    assert it["tts_text"] == "すみません、えきはどこですか。"
    assert it["plain"] == "すみません、駅はどこですか。"


def test_ruby_with_kanji_compound():
    items = parse_script("[1] 田中{たなか}さん")
    assert items[0]["tts_text"] == "たなかさん"


def test_pause_item():
    items = parse_script("[1] はい。\n[pause=1500]\n[2] いいえ。")
    assert items[1] == {"type": "pause", "ms": 1500, "src_line": 2, "id": "L002"}
    assert items[2]["type"] == "line"


def test_pause_tolerates_spaces():
    items = parse_script("[1] はい。\n[ pause = 800 ]")
    assert items[1]["ms"] == 800


def test_continuation_line_appended():
    items = parse_script("[3] えっ、田中さん！\n    久しぶりですね。")
    assert items[0]["text"] == "えっ、田中さん！久しぶりですね。"


def test_line_without_role_is_error_with_line_number():
    with pytest.raises(ScriptError, match="Dòng 1"):
        parse_script("こんにちは。")


def test_empty_script_is_error():
    with pytest.raises(ScriptError):
        parse_script("# chỉ có ghi chú\n")


def test_parse_attrs_ignores_malformed_pairs():
    assert parse_attrs("emotion=sad, junk, speed = fast") == {
        "emotion": "sad",
        "speed": "fast",
    }
    assert parse_attrs(None) == {}


def test_malformed_tag_is_error_not_merged_into_speech():
    with pytest.raises(ScriptError, match="Dòng 2"):
        parse_script("[1] はい。\n[pause=abc]")
