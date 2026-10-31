import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.models import Config, Project, load_config, load_project, save_project  # noqa: E402
from core.parser import parse_script  # noqa: E402
from tts import project_from_script  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def _cfg(**overrides):
    base = {"engine": "edge", "roles": {"1": {"voice": "ja-JP-KeitaNeural"}}}
    base.update(overrides)
    return Config.model_validate(base)


def test_roles_yaml_in_repo_is_valid():
    cfg = load_config(ROOT / "roles.yaml")
    assert set(cfg.roles) == {"1", "2", "3"}


def test_role_rejects_unknown_emotion():
    with pytest.raises(ValidationError):
        Config.model_validate({"roles": {"1": {"voice": "x", "emotion": "furious"}}})


def test_role_rejects_missing_voice():
    with pytest.raises(ValidationError):
        Config.model_validate({"roles": {"1": {"emotion": "happy"}}})


def test_role_id_must_be_digits():
    with pytest.raises(ValidationError, match="Mã vai phải là số"):
        Config.model_validate({"roles": {"A": {"voice": "x"}}})


def test_unknown_key_in_roles_yaml_is_rejected():
    with pytest.raises(ValidationError):
        Config.model_validate({"roles": {"1": {"voice": "x"}}, "enigne": "edge"})


def test_project_from_script_checks_roles_used():
    script = Path("/tmp/_t_script.txt")
    script.write_text("[1] はい。\n[2] いいえ。", encoding="utf-8")
    with pytest.raises(ValidationError, match="Vai chưa được cấu hình: 2"):
        project_from_script(script, _cfg())


def test_project_roundtrip_json(tmp_path):
    script = tmp_path / "s.txt"
    script.write_text("[1] すみません、駅{えき}はどこですか。\n[pause=300]\n[1] はい。", encoding="utf-8")
    proj = project_from_script(script, _cfg())
    path = tmp_path / "projects" / "p.json"
    save_project(proj, path)
    loaded = load_project(path)
    assert loaded == proj
    assert loaded.items[0].tts_text == "すみません、えきはどこですか。"
    assert '"version": 1' in path.read_text(encoding="utf-8")


def test_project_rejects_unsupported_version(tmp_path):
    proj = project_from_script(
        (tmp_path / "s.txt").write_text("[1] はい。", encoding="utf-8") and tmp_path / "s.txt",
        _cfg(),
    )
    data = proj.model_dump(mode="json")
    data["version"] = 99
    with pytest.raises(ValidationError, match="không hỗ trợ"):
        Project.model_validate(data)


def test_project_requires_a_spoken_line():
    with pytest.raises(ValidationError, match="không có câu thoại"):
        Project.model_validate({"engine": "edge", "roles": {}, "items": [
            {"id": "L001", "type": "pause", "src_line": 1, "ms": 100}]})
