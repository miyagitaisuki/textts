"""Giao diện chung cho mọi engine TTS."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class SynthRequest:
    text: str
    voice: str
    emotion: str = "neutral"
    speed: str = "normal"
    pitch: int = 0  # Hz tương đối so với giọng gốc


class TTSProvider(ABC):
    """Mỗi engine implement `name` và `synthesize_mp3`/`synthesize`."""

    name: str = "base"
    ext: str = "mp3"  # đuôi file engine trả về, dùng để đặt tên cache

    @abstractmethod
    async def synthesize(self, req: SynthRequest, out_path: str) -> None:
        """Ghi âm thanh của `req` vào `out_path` (định dạng engine trả về)."""
