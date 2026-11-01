"""Engine VOICEVOX chạy trên máy (offline, mã mở). Không cần mạng.

Cần chạy VOICEVOX Engine trước (mặc định http://127.0.0.1:50021, đổi bằng biến
môi trường VOICEVOX_URL). Trường `voice` của vai là mã nhân vật (speaker id), ví dụ "3".

Ghi chú:
- VOICEVOX không có cảm xúc tách riêng theo API này, nên `emotion` bị bỏ qua.
  Mỗi nhân vật có các style khác nhau: đổi `voice` sang mã style để có cảm xúc khác.
- Cao độ Hz được quy đổi gần đúng sang `pitchScale` (chỉ nằm trong khoảng ±0.15).
"""
from __future__ import annotations

import os
from pathlib import Path

import aiohttp

from providers.base import SynthRequest, TTSProvider

SPEED_SCALE = {"slow": 0.85, "normal": 1.0, "fast": 1.15}
PITCH_HZ_PER_UNIT = 300.0  # ~50 Hz tương ứng pitchScale 0.15 (xấp xỉ)
PITCH_LIMIT = 0.15
DEFAULT_URL = "http://127.0.0.1:50021"


class VoicevoxProvider(TTSProvider):
    name = "voicevox"
    ext = "wav"

    def __init__(self, base_url: str | None = None, timeout: float = 60.0):
        self.base_url = (base_url or os.environ.get("VOICEVOX_URL") or DEFAULT_URL).rstrip("/")
        self.timeout = aiohttp.ClientTimeout(total=timeout)

    async def synthesize(self, req: SynthRequest, out_path: str) -> None:
        if req.speed not in SPEED_SCALE:
            raise ValueError(f"speed không hợp lệ: {req.speed!r}")
        speaker = str(req.voice)
        async with aiohttp.ClientSession(timeout=self.timeout) as session:
            async with session.post(
                f"{self.base_url}/audio_query", params={"text": req.text, "speaker": speaker}
            ) as r:
                r.raise_for_status()
                query = await r.json()
            query["speedScale"] = SPEED_SCALE[req.speed]
            query["pitchScale"] = max(-PITCH_LIMIT, min(PITCH_LIMIT, req.pitch / PITCH_HZ_PER_UNIT))
            async with session.post(
                f"{self.base_url}/synthesis", params={"speaker": speaker}, json=query
            ) as r:
                r.raise_for_status()
                data = await r.read()
        Path(out_path).write_bytes(data)


async def list_speakers(base_url: str | None = None, timeout: float = 10.0) -> list[dict]:
    """Danh sách giọng (mỗi style là một giá trị `voice`) lấy từ VOICEVOX Engine /speakers."""
    url = (base_url or os.environ.get("VOICEVOX_URL") or DEFAULT_URL).rstrip("/")
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
        async with session.get(f"{url}/speakers") as resp:
            resp.raise_for_status()
            data = await resp.json()
    return [
        {"value": str(style["id"]), "label": f'{speaker["name"]} ({style["name"]})'}
        for speaker in data
        for style in speaker.get("styles", [])
    ]
