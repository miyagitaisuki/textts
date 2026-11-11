"""Các bước dựng bài dùng chung cho CLI (tts.py) và API (server.py)."""
from __future__ import annotations

from pathlib import Path

from pydub import AudioSegment

from core.audio import add_background, apply_scenes
from core.models import BgmItem, Project, SfxItem
from core.paths import sfx_path
from core.sounds import SoundNotFound, parse_layer, resolve_bgm

SCENE_DEFAULT_DB = -20.0


def resolve_layers(specs: list[str], default_db: float = SCENE_DEFAULT_DB) -> list[dict]:
    """["mua", "duong-pho@-26"] -> [{"path", "db"}]; ném SoundNotFound nếu không tìm được âm."""
    out = []
    for spec in specs:
        ref, db = parse_layer(spec, default_db)
        out.append({"path": str(resolve_bgm(ref)), "db": db})
    return out


def build_items_for(project: Project, base: Path) -> list[dict]:
    """Mục để builder ghép: đường dẫn sfx và lớp nền của từng cảnh đã được tìm sẵn."""
    items = []
    for it in project.items:
        d = it.model_dump()
        if isinstance(it, SfxItem):
            d["path"] = str(sfx_path(it.path, base))
        elif isinstance(it, BgmItem):
            d["resolved_layers"] = resolve_layers(it.layers)
        items.append(d)
    return items


def missing_scene_sounds(project: Project) -> list[str]:
    errors = []
    for it in project.items:
        if isinstance(it, BgmItem):
            for spec in it.layers:
                try:
                    resolve_layers([spec])
                except SoundNotFound as exc:
                    errors.append(f"{it.id} (dòng {it.src_line}): {exc}")
    return errors


def finish(audio: AudioSegment, markers: list[dict], bgm_layers: list[dict]) -> AudioSegment:
    """Trộn âm nền theo cảnh ([bgm=...] trong kịch bản) và các lớp nền suốt bài (tùy chọn bgm)."""
    audio = apply_scenes(audio, [m for m in markers if m.get("type") == "scene"])
    for layer in bgm_layers:
        audio = add_background(audio, AudioSegment.from_file(layer["path"]), gain_db=layer["db"])
    return audio


def used_sound_paths(markers: list[dict], bgm_layers: list[dict]) -> list[str]:
    paths = [l["path"] for l in bgm_layers]
    for m in markers:
        if m.get("type") == "sfx":
            paths.append(m["path"])
        elif m.get("type") == "scene":
            paths += [l["path"] for l in m.get("layers", [])]
    return paths
