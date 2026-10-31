import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

pytest.importorskip("pyopenjtalk")

from core.normalize import annotate, reading, to_hiragana, _long_vowels  # noqa: E402


def test_reading_uses_kanji_readings_and_keeps_particle_wa():
    assert reading("すみません、駅はどこですか。") == "すみません、えきはどこですか。"


def test_reading_respects_existing_ruby():
    assert reading("駅{えき}はどこですか。") == "えきはどこですか。"


def test_reading_keeps_kana_only_text():
    assert reading("ありがとうございます。") == "ありがとうございます。"


def test_long_vowels_follow_standard_rules():
    assert _long_vowels("とーきょーえき") == "とうきょうえき"
    assert _long_vowels("ほんとーに") == "ほんとうに"
    assert _long_vowels("せんせー") == "せんせい"
    assert _long_vowels("おーさか") == "おうさか"


def test_to_hiragana_converts_katakana():
    assert to_hiragana("エキ") == "えき"


def test_annotate_adds_ruby_for_pure_kanji_words():
    assert annotate("駅はどこですか。") == "駅{えき}はどこですか。"
    assert annotate("田中さん") == "田中{たなか}さん"


def test_annotate_leaves_existing_ruby_and_mixed_words_alone():
    assert annotate("駅{えき}です") == "駅{えき}です"
    assert annotate("本当に久しぶり") == "本当に久しぶり"


def test_cli_roundtrip_json():
    proc = subprocess.run(
        [sys.executable, "-m", "core.normalize"],
        input=json.dumps(["駅はどこ"], ensure_ascii=False),
        capture_output=True, text=True, cwd=ROOT, check=True,
    )
    out = json.loads(proc.stdout)
    assert out == [{"reading": "えきはどこ", "annotated": "駅{えき}はどこ"}]
