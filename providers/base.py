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
    pause_scale: float = 1.0  # độ dài chỗ ngắt ở 、 (engine nào hỗ trợ thì dùng)
    accent: str = ""  # vị trí accent từng cụm, cách nhau bằng "/" (vd "2/0"); rỗng = engine tự quyết


class TTSProvider(ABC):
    """Mỗi engine implement `name` và `synthesize_mp3`/`synthesize`."""

    name: str = "base"
    ext: str = "mp3"  # đuôi file engine trả về, dùng để đặt tên cache
    cache_salt: str = ""  # thêm vào khóa cache khi engine có tinh chỉnh phiên bản/cấu hình
    supports_pause_scale: bool = False  # engine chỉnh được độ dài chỗ ngắt ở 、

    @abstractmethod
    async def synthesize(self, req: SynthRequest, out_path: str) -> None:
        """Ghi âm thanh của `req` vào `out_path` (định dạng engine trả về)."""
