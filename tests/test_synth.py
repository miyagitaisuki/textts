import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.models import Config, Project  # noqa: E402
from core.parser import parse_script  # noqa: E402
from providers.base import SynthRequest, TTSProvider  # noqa: E402
from tts import cache_key, resolve, synth_all  # noqa: E402

ROLES = {
    "1": {"voice": "v1", "emotion": "neutral", "speed": "normal", "pitch": 0},
    "2": {"voice": "v2", "emotion": "happy", "speed": "slow", "pitch": -8},
}


class FakeProvider(TTSProvider):
    name = "fake"

    def __init__(self, fail_times=None):
        self.calls = []
        self.fail_times = dict(fail_times or {})  # text -> số lần lỗi trước khi thành công

    async def synthesize(self, req: SynthRequest, out_path: str) -> None:
        self.calls.append(req.text)
        if self.fail_times.get(req.text, 0) > 0:
            self.fail_times[req.text] -= 1
            raise ConnectionError("tạm thời")
        Path(out_path).write_bytes(req.text.encode("utf-8") or b"x")


def _project(script: str) -> Project:
    return Project.model_validate({
        "engine": "fake",
        "roles": ROLES,
        "items": [
            {k: v for k, v in it.items() if k != "text"} for it in parse_script(script)
        ],
    })


def _run(project, provider, cache, **kw):
    return asyncio.run(synth_all(project, provider, cache, wait_min=0, wait_max=0, **kw))


def test_resolve_line_attrs_override_role():
    proj = _project("[1]{emotion=angry, pitch=5} はい。")
    req = resolve(proj.items[0], proj.roles)
    assert (req.voice, req.emotion, req.speed, req.pitch) == ("v1", "angry", "normal", 5)


def test_resolve_role_defaults_apply_when_no_attrs():
    proj = _project("[2] はい。")
    req = resolve(proj.items[0], proj.roles)
    assert (req.emotion, req.speed, req.pitch) == ("happy", "slow", -8)


def test_cache_key_changes_with_any_field():
    base = SynthRequest("text", "v", "neutral", "normal", 0)
    keys = {
        cache_key("e", base),
        cache_key("e", SynthRequest("text2", "v", "neutral", "normal", 0)),
        cache_key("e", SynthRequest("text", "v", "happy", "normal", 0)),
        cache_key("e", SynthRequest("text", "v", "neutral", "slow", 0)),
        cache_key("e", SynthRequest("text", "v", "neutral", "normal", 1)),
    }
    assert len(keys) == 5


def test_editing_one_line_regenerates_only_that_line(tmp_path):
    cache = tmp_path / "cache"
    p = FakeProvider()
    proj = _project("[1] はい。\n[2] いいえ。\n[1] ありがとう。")
    assert _run(proj, p, cache) == []
    assert len(p.calls) == 3

    # Đổi cảm xúc của đúng một câu (câu 2)
    edited = _project("[1] はい。\n[2]{emotion=sad} いいえ。\n[1] ありがとう。")
    p2 = FakeProvider()
    assert _run(edited, p2, cache) == []
    assert p2.calls == ["いいえ。"]


def test_rerun_without_changes_makes_no_calls(tmp_path):
    cache = tmp_path / "cache"
    _run(_project("[1] はい。"), FakeProvider(), cache)
    p = FakeProvider()
    proj = _project("[1] はい。")
    assert _run(proj, p, cache) == []
    assert p.calls == []
    assert proj.items[0].audio is not None


def test_transient_error_is_retried_and_succeeds(tmp_path):
    p = FakeProvider(fail_times={"はい。": 2})
    proj = _project("[1] はい。")
    assert _run(proj, p, tmp_path, attempts=3) == []
    assert p.calls == ["はい。", "はい。", "はい。"]


def test_permanent_error_reported_per_line_without_stopping_batch(tmp_path):
    p = FakeProvider(fail_times={"いいえ。": 99})
    proj = _project("[1] はい。\n[2] いいえ。\n[1] ありがとう。")
    errors = _run(proj, p, tmp_path, attempts=2)
    assert len(errors) == 1 and "L002" in errors[0] and "dòng 2" in errors[0]
    ok = [it for it in proj.items if getattr(it, "audio", None)]
    assert len(ok) == 2
    assert not list(tmp_path.glob("*.part"))


def test_only_ids_synthesizes_just_that_line(tmp_path):
    p = FakeProvider()
    proj = _project("[1] はい。\n[2] いいえ。\n[1] ありがとう。")
    assert _run(proj, p, tmp_path, only_ids={"L002"}) == []
    assert p.calls == ["いいえ。"]
    assert [getattr(it, "audio", None) is not None for it in proj.items if hasattr(it, "role")] == [False, True, False]


def test_edited_display_changes_reading(tmp_path):
    from core.models import LineItem
    it = LineItem(id="L001", src_line=1, role="1", display="駅{えき}です", tts_text="", plain="")
    assert it.tts_text == "えきです" and it.plain == "駅です"
    it.display = "田中{たなか}さん"
    it2 = LineItem.model_validate(it.model_dump())
    assert it2.tts_text == "たなかさん"


def test_duplicate_ids_rejected():
    import pytest
    from pydantic import ValidationError
    from core.models import Project
    with pytest.raises(ValidationError, match="Trùng mã câu"):
        Project.model_validate({"engine": "e", "roles": ROLES, "items": [
            {"id": "L001", "type": "line", "src_line": 1, "role": "1", "display": "はい", "tts_text": "", "plain": ""},
            {"id": "L001", "type": "line", "src_line": 2, "role": "1", "display": "いいえ", "tts_text": "", "plain": ""}]})
