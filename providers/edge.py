"""Engine Edge-TTS (miễn phí, không cần API key). Chỉ dùng cho MVP/thử nghiệm.

Cảm xúc không được hỗ trợ trực tiếp: mô phỏng bằng cách cộng thêm pitch/rate.
"""
from __future__ import annotations

import edge_tts

from providers.base import SynthRequest, TTSProvider

# Hai giọng ja-JP của Edge-TTS (dùng cho danh sách chọn giọng trong giao diện).
VOICES = ["ja-JP-KeitaNeural", "ja-JP-NanamiNeural"]

SPEED_PCT = {"slow": -20, "normal": 0, "fast": 15}

# emotion -> (pitch Hz, rate %) cộng thêm vào cấu hình vai
EMOTION_OFFSET = {
    "neutral": (0, 0),
    "happy": (10, 5),
    "sad": (-10, -10),
    "angry": (5, 0),
    "surprised": (20, 0),
}


def _signed(n: int, unit: str) -> str:
    return f"{n:+d}{unit}"


class EdgeProvider(TTSProvider):
    name = "edge"

    async def synthesize(self, req: SynthRequest, out_path: str) -> None:
        if req.speed not in SPEED_PCT:
            raise ValueError(f"speed không hợp lệ: {req.speed!r} (slow/normal/fast)")
        if req.emotion not in EMOTION_OFFSET:
            raise ValueError(f"emotion không hợp lệ: {req.emotion!r}")

        d_pitch, d_rate = EMOTION_OFFSET[req.emotion]
        rate = SPEED_PCT[req.speed] + d_rate
        pitch = req.pitch + d_pitch

        communicate = edge_tts.Communicate(
            req.text,
            req.voice,
            rate=_signed(rate, "%"),
            pitch=_signed(pitch, "Hz"),
        )
        await communicate.save(out_path)
