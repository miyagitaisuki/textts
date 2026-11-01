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


def add_background(
    speech: AudioSegment,
    bgm: AudioSegment,
    gain_db: float = -18.0,
    fade_in_ms: int = 1000,
    fade_out_ms: int = 2000,
) -> AudioSegment:
    """Trộn nhạc nền lặp lại dưới lời thoại, có fade vào và fade ra."""
    bgm = bgm.set_frame_rate(speech.frame_rate).set_channels(speech.channels)
    bgm = bgm.set_sample_width(speech.sample_width)
    if len(bgm) == 0:
        raise ValueError("File nhạc nền rỗng")
    loops = len(speech) // len(bgm) + 1
    looped = (bgm * loops)[: len(speech)]
    looped = looped + gain_db
    fade_in = min(fade_in_ms, len(looped) // 2)
    fade_out = min(fade_out_ms, len(looped) // 2)
    looped = looped.fade_in(fade_in).fade_out(fade_out)
    return speech.overlay(looped)


def peaks(seg: AudioSegment, bins: int = 600) -> list[float]:
    """Biên độ lớn nhất của từng khoảng thời gian, chuẩn hóa về 0..1 (để vẽ sóng)."""
    if len(seg) == 0 or bins <= 0:
        return []
    mono = seg.set_channels(1)
    scale = float(1 << (8 * mono.sample_width - 1))
    samples = np.abs(np.array(mono.get_array_of_samples(), dtype=np.float64)) / scale
    chunks = np.array_split(samples, min(bins, len(samples)))
    values = [float(c.max()) if len(c) else 0.0 for c in chunks]
    top = max(values) or 1.0
    return [round(v / top, 3) for v in values]


def role_levels(
    audio: AudioSegment,
    placed: list[dict],
    bins: int = 600,
    floor_db: float = -60.0,
) -> dict[str, list[float]]:
    """Mức âm lượng (0..1, thang dB từ floor_db đến 0 dBFS) của từng vai theo thời gian.

    Chỉ tính các đoạn thuộc về vai đó, nên VU meter của từng vai chạy độc lập.
    """
    mono = audio.set_channels(1)
    scale = float(1 << (8 * mono.sample_width - 1))
    x = np.array(mono.get_array_of_samples(), dtype=np.float64) / scale
    n = len(x)
    if n == 0 or bins <= 0:
        return {}
    rate = mono.frame_rate
    edges = np.linspace(0, n, bins + 1).astype(int)
    result: dict[str, list[float]] = {}
    for role in sorted({it["role"] for it in placed}):
        mask = np.zeros(n, dtype=np.float64)
        for it in placed:
            if it["role"] != role:
                continue
            a = min(n, int(it["start_ms"] * rate / 1000))
            b = min(n, int(it["end_ms"] * rate / 1000))
            mask[a:b] = 1.0
        sq = (x * mask) ** 2
        levels = []
        for i in range(bins):
            lo, hi = edges[i], edges[i + 1]
            if hi <= lo:
                levels.append(0.0)
                continue
            rms = float(np.sqrt(sq[lo:hi].mean()))
            db = 20 * np.log10(rms) if rms > 0 else floor_db
            levels.append(round(float(np.clip((db - floor_db) / -floor_db, 0.0, 1.0)), 3))
        result[role] = levels
    return result
