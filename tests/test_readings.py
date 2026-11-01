from pathlib import Path

import pytest

from core.parser import parse_script
from core.readings import apply_readings, load_readings


def test_adds_reading_to_plain_word():
    assert apply_readings("日本語を勉強します", {"日本語": "にほんご"}) == "日本語{にほんご}を勉強します"


def test_keeps_explicit_reading():
    assert apply_readings("日本{にほん}語", {"日本": "にっぽん"}) == "日本{にほん}語"


def test_longer_word_wins():
    readings = {"日本": "にほん", "日本語": "にほんご"}
    assert apply_readings("日本語", readings) == "日本語{にほんご}"


def test_empty_dictionary_is_noop():
    assert apply_readings("日本語", {}) == "日本語"


def test_parse_script_uses_readings_for_tts_text():
    items = parse_script("[1] 日本語です\n", {"日本語": "にほんご"})
    line = next(it for it in items if it["type"] == "line")
    assert line["display"] == "日本語{にほんご}です"
    assert line["tts_text"] == "にほんごです"
    assert line["plain"] == "日本語です"


def test_load_readings_missing_file_returns_empty(tmp_path: Path):
    assert load_readings(tmp_path / "none.yaml") == {}


def test_load_readings_rejects_non_kana(tmp_path: Path):
    f = tmp_path / "r.yaml"
    f.write_text("日本語: Nihongo\n", encoding="utf-8")
    with pytest.raises(ValueError):
        load_readings(f)


def test_load_readings_reads_yaml(tmp_path: Path):
    f = tmp_path / "r.yaml"
    f.write_text("日本語: にほんご\n", encoding="utf-8")
    assert load_readings(f) == {"日本語": "にほんご"}
