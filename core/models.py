"""Mô hình dữ liệu (pydantic) cho cấu hình vai, kịch bản và file project.json."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from core.parser import RUBY_RE

Emotion = Literal["neutral", "happy", "sad", "angry", "surprised"]
Speed = Literal["slow", "normal", "fast"]
SCHEMA_VERSION = 1


class Timing(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lead_in_ms: int = Field(300, ge=0)
    turn_gap_ms: int = Field(450, ge=0)
    same_speaker_gap_ms: int = Field(200, ge=0)
    tail_ms: int = Field(500, ge=0)


class Role(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = ""
    voice: str = Field(min_length=1)
    emotion: Emotion = "neutral"
    speed: Speed = "normal"
    pitch: int = Field(0, ge=-50, le=50)  # Hz tương đối


class Config(BaseModel):
    """Nội dung của roles.yaml."""

    model_config = ConfigDict(extra="forbid")
    engine: str = "edge"
    timing: Timing = Field(default_factory=Timing)
    roles: dict[str, Role]

    @field_validator("roles")
    @classmethod
    def _role_ids_are_digits(cls, v: dict[str, Role]) -> dict[str, Role]:
        bad = [k for k in v if not str(k).isdigit()]
        if bad:
            raise ValueError(f"Mã vai phải là số: {', '.join(bad)}")
        return v


class LineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    type: Literal["line"] = "line"
    src_line: int
    role: str
    attrs: dict[str, str] = Field(default_factory=dict)
    display: str
    tts_text: str
    plain: str
    cache_key: str | None = None
    audio: str | None = None

    @model_validator(mode="after")
    def _derive_reading(self) -> "LineItem":
        # Cách đọc luôn suy ra từ chữ hiển thị, để sửa display là đủ.
        self.tts_text = RUBY_RE.sub(r"\2", self.display)
        self.plain = RUBY_RE.sub(r"\1", self.display)
        return self


class PauseItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    type: Literal["pause"] = "pause"
    src_line: int
    ms: int = Field(ge=0)


class SfxItem(BaseModel):
    """Hiệu ứng âm thanh chèn vào đúng vị trí: [sfx=đường/dẫn.wav]."""

    model_config = ConfigDict(extra="forbid")
    id: str
    type: Literal["sfx"] = "sfx"
    src_line: int
    path: str = Field(min_length=1)


Item = Annotated[Union[LineItem, PauseItem, SfxItem], Field(discriminator="type")]


class Project(BaseModel):
    """Nội dung của project.json: cấu hình + kịch bản đã phân tích."""

    model_config = ConfigDict(extra="forbid")
    version: int = SCHEMA_VERSION
    title: str = ""
    engine: str
    timing: Timing = Field(default_factory=Timing)
    roles: dict[str, Role]
    items: list[Item]

    @model_validator(mode="after")
    def _roles_exist(self) -> "Project":
        used = {it.role for it in self.items if isinstance(it, LineItem)}
        missing = sorted(used - set(self.roles))
        if missing:
            raise ValueError("Vai chưa được cấu hình: " + ", ".join(missing))
        if not any(isinstance(it, LineItem) for it in self.items):
            raise ValueError("Project không có câu thoại nào")
        return self

    @model_validator(mode="after")
    def _ids_unique(self) -> "Project":
        ids = [it.id for it in self.items]
        dup = sorted({i for i in ids if ids.count(i) > 1})
        if dup:
            raise ValueError("Trùng mã câu: " + ", ".join(dup))
        return self

    @model_validator(mode="after")
    def _version_supported(self) -> "Project":
        if self.version != SCHEMA_VERSION:
            raise ValueError(f"Phiên bản project.json không hỗ trợ: {self.version}")
        return self


def load_config(path: Path) -> Config:
    import yaml

    with path.open(encoding="utf-8") as f:
        return Config.model_validate(yaml.safe_load(f) or {})


def load_project(path: Path) -> Project:
    return Project.model_validate_json(path.read_text(encoding="utf-8"))


def save_project(project: Project, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(project.model_dump(mode="json"), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)
