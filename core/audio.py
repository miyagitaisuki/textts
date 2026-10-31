"""Xử lý âm thanh cho đầu ra dạy học: đổi tốc độ không đổi cao độ, chuẩn hóa LUFS."""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
from pydub import AudioSegment


def time_stretch(seg: AudioSegment, rate: float) -> AudioSegment:
    """Đổi tốc độ đọc (rate < 1 là chậm hơn) và giữ nguyên cao độ, dùng filter atempo của ffmpeg."""
    if not 0.5 <= rate <= 2.0:
        raise ValueError("atempo của ffmpeg chỉ hỗ trợ tốc độ từ 0.5 đến 2.0")
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.wav"
        dst = Path(tmp) / "out.wav"
        seg.export(src, format="wav")
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-filter:a", f"atempo={rate}", str(dst)],
            check=True,
        )
        return AudioSegment.from_file(dst)


def loudness_normalize(seg: AudioSegment, target_lufs: float = -16.0) -> AudioSegment:
    """Chuẩn hóa độ to tích hợp (LUFS) về mức đích. Đoạn im lặng hoàn toàn được giữ nguyên."""
    channels = seg.channels
    scale = float(1 << (8 * seg.sample_width - 1))
    samples = np.array(seg.get_array_of_samples(), dtype=np.float64) / scale
    samples = samples.reshape(-1, channels)

    meter = pyln.Meter(seg.frame_rate)
    loudness = meter.integrated_loudness(samples)
    if not np.isfinite(loudness):
        return seg
    adjusted = pyln.normalize.loudness(samples, loudness, target_lufs)
    adjusted = np.clip(adjusted, -1.0, 1.0)
    pcm = (adjusted * (scale - 1)).astype(np.int32 if seg.sample_width > 2 else np.int16)
    return seg._spawn(pcm.reshape(-1).tobytes()).set_sample_width(seg.sample_width)
