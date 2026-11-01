from pathlib import Path

from core.lint import lint_project
from core.models import Project


def _project(items, roles=("1",)):
    return Project.model_validate({
        "title": "t", "engine": "edge", "timing": {},
        "roles": {r: {"voice": "ja-JP-NanamiNeural"} for r in roles},
        "items": items,
    })


def test_reports_missing_sfx(tmp_path: Path):
    p = _project([
        {"id": "L001", "type": "line", "role": "1", "src_line": 1, "attrs": {},
         "display": "こんにちは", "tts_text": "こんにちは", "plain": "こんにちは"},
        {"id": "S001", "type": "sfx", "path": "nope.wav", "src_line": 2},
    ])
    issues = [i for i in lint_project(p, tmp_path) if i["level"] == "error"]
    assert [i["id"] for i in issues] == ["S001"]


def test_clean_project_has_no_errors(tmp_path: Path):
    p = _project([
        {"id": "L001", "type": "line", "role": "1", "src_line": 1, "attrs": {},
         "display": "こんにちは", "tts_text": "こんにちは", "plain": "こんにちは"},
    ])
    assert [i for i in lint_project(p, tmp_path) if i["level"] == "error"] == []


def test_kanji_without_reading_is_warning(tmp_path: Path):
    p = _project([
        {"id": "L001", "type": "line", "role": "1", "src_line": 1, "attrs": {},
         "display": "日本語", "tts_text": "日本語", "plain": "日本語"},
    ])
    levels = [i["level"] for i in lint_project(p, tmp_path)]
    assert levels == ["warning"]
