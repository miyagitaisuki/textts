"""Thư viện âm thanh dùng chung giữa app và AI (API/MCP)."""
from __future__ import annotations

import hashlib
from pathlib import Path
from unittest.mock import patch

import pytest
from pydub import AudioSegment
from pydub.generators import Sine

from core import sounds
from core.sounds import SoundNotFound, find_sound, list_sounds, parse_layer

PACK_BYTES = b"fake-mp3-bytes"


def _manifest():
    return {
        "version": "v1",
        "baseUrl": "https://example.test/v1/",
        "items": [
            {"id": "bgm-cong-vien", "kind": "bgm", "name": "Công viên (chim hót)", "category": "Thiên nhiên",
             "file": "bgm-cong-vien.mp3", "bytes": len(PACK_BYTES),
             "sha256": hashlib.sha256(PACK_BYTES).hexdigest()},
            {"id": "bgm-mua", "kind": "bgm", "name": "Mưa", "category": "Thiên nhiên", "file": "bgm-mua.mp3",
             "bytes": 3, "sha256": "0" * 64},
            {"id": "sfx-chuong-cua", "kind": "sfx", "name": "Chuông cửa", "category": "Nhà cửa",
             "file": "sfx-chuong-cua.mp3", "bytes": 3, "sha256": "0" * 64},
        ],
    }


def _mine(lib: Path, kind: str, name: str) -> Path:
    d = lib / "my" / kind
    d.mkdir(parents=True, exist_ok=True)
    f = d / name
    f.write_bytes(b"x")
    return f


def test_lists_pack_and_personal_sounds(tmp_path):
    _mine(tmp_path, "bgm", "Công viên Yoyogi.mp3")
    items = list_sounds("bgm", tmp_path, _manifest())
    assert [i["id"] for i in items] == ["bgm-cong-vien", "bgm-mua", "my-bgm-Công viên Yoyogi.mp3"]
    assert items[0]["downloaded"] is False and items[2]["source"] == "mine"
    assert [i["kind"] for i in list_sounds("sfx", tmp_path, _manifest())] == ["sfx"]


def test_find_by_vietnamese_name_or_ref_prefers_teacher_files(tmp_path):
    mine = _mine(tmp_path, "bgm", "cong vien.mp3")
    assert find_sound("Công viên", "bgm", lib=tmp_path, manifest=_manifest()) == mine
    assert find_sound("cong-vien", "bgm", lib=tmp_path, manifest=_manifest()) == mine


def test_pack_sound_is_downloaded_and_verified_on_first_use(tmp_path):
    class Resp:
        def __init__(self, data):
            self.data = data

        def read(self):
            return self.data

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    with patch.object(sounds.urllib.request, "urlopen", return_value=Resp(PACK_BYTES)) as op:
        f = find_sound("cong-vien", "bgm", lib=tmp_path, manifest=_manifest())
    assert op.call_args[0][0] == "https://example.test/v1/bgm-cong-vien.mp3"
    assert f.read_bytes() == PACK_BYTES
    with patch.object(sounds.urllib.request, "urlopen", return_value=Resp(b"evil")):
        with pytest.raises(SoundNotFound, match="SHA-256"):
            find_sound("mua", "bgm", lib=tmp_path, manifest=_manifest())


def test_unknown_or_ambiguous_names_list_what_exists(tmp_path):
    with pytest.raises(SoundNotFound, match="Mưa"):
        find_sound("tiếng tàu điện", "bgm", lib=tmp_path, manifest=_manifest())


def test_parse_layer():
    assert parse_layer("mua@-22", -18) == ("mua", -22.0)
    assert parse_layer("C:/a/b.mp3", -18) == ("C:/a/b.mp3", -18)


def test_sfx_line_can_name_a_library_sound(tmp_path, monkeypatch):
    from core.paths import sfx_path

    monkeypatch.setenv("TEXTTS_SOUND_LIBRARY", str(tmp_path))
    bell = _mine(tmp_path, "sfx", "chuong cua.mp3")
    assert sfx_path("chuong-cua", tmp_path / "project") == bell
    assert sfx_path("khong-co", tmp_path) == tmp_path / "khong-co"  # không có thì giữ nguyên để báo lỗi


def test_cli_stacks_several_background_layers(tmp_path, monkeypatch):
    """tts.py --bgm lặp lại: mỗi lớp trộn với âm lượng riêng và được ghi vào timeline."""
    import json

    import tts

    lib = tmp_path / "lib"
    monkeypatch.setenv("TEXTTS_SOUND_LIBRARY", str(lib))
    for name, freq in (("mua.wav", 300), ("xe.wav", 500)):
        d = lib / "my" / "bgm"
        d.mkdir(parents=True, exist_ok=True)
        Sine(freq).to_audio_segment(1000, volume=-6).export(d / name, format="wav")
    line = tmp_path / "l.wav"
    Sine(440).to_audio_segment(800, volume=-6).export(line, format="wav")
    proj = tmp_path / "p.json"
    proj.write_text(json.dumps({
        "engine": "edge", "roles": {"1": {"voice": "v"}},
        "items": [{"id": "L001", "type": "line", "src_line": 1, "role": "1", "display": "はい",
                   "tts_text": "", "plain": "", "audio": str(line), "cache_key": "k"}],
    }), encoding="utf-8")
    out = tmp_path / "o.wav"
    added = []
    real = tts.add_background

    def spy(speech, bgm, gain_db=-18.0, **kw):
        added.append(gain_db)
        return real(speech, bgm, gain_db=gain_db, **kw)

    async def no_synth(*a, **k):
        return []

    monkeypatch.setattr(tts, "add_background", spy)
    monkeypatch.setattr(tts, "synth_all", no_synth)
    code = tts.main(["--project", str(proj), "-o", str(out), "--bgm", "mua", "--bgm", "xe@-30"])
    assert code == 0
    assert added == [-18.0, -30.0]
    tl = json.loads(out.with_name("o.timeline.json").read_text(encoding="utf-8"))
    assert [Path(l["path"]).name for l in tl["bgm"]] == ["mua.wav", "xe.wav"]
    assert AudioSegment.from_file(out).duration_seconds > 0
