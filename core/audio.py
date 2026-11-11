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
    """Chuẩn hóa độ to tích hợp (LUFS) về mức đích. Đoạn im lặng hoàn toàn hoặc quá ngắn (< 400ms) được giữ nguyên."""
    if len(seg) < 400:
        return seg
    channels = seg.channels
    scale = float(1 << (8 * seg.sample_width - 1))
    samples = np.array(seg.get_array_of_samples(), dtype=np.float64) / scale
    samples = samples.reshape(-1, channels)

    meter = pyln.Meter(seg.frame_rate)
    try:
        loudness = meter.integrated_loudness(samples)
    except ValueError:
        return seg
    if not np.isfinite(loudness):
        return seg
    adjusted = pyln.normalize.loudness(samples, loudness, target_lufs)
    adjusted = np.clip(adjusted, -1.0, 1.0)
    pcm = (adjusted * (scale - 1)).astype(np.int32 if seg.sample_width > 2 else np.int16)
    return seg._spawn(pcm.reshape(-1).tobytes()).set_sample_width(seg.sample_width)


def limit_peak(seg: AudioSegment, ceiling_db: float = -1.0) -> AudioSegment:
    """Hạ âm lượng cả bài nếu đỉnh vượt `ceiling_db` dBFS, để chừa khoảng trống cho MP3/loa (tránh vỡ tiếng)."""
    if len(seg) == 0 or seg.max == 0:
        return seg
    over = seg.max_dBFS - ceiling_db
    return seg - over if over > 0 else seg


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


# --- Hiệu ứng giọng cho "đạo diễn" kịch bản ({fx=...}) ---------------------------------------
FX_NAMES = ("phone", "whisper", "far", "radio", "echo")


def _echo(seg: AudioSegment, taps: tuple[tuple[int, float], ...]) -> AudioSegment:
    out = seg + AudioSegment.silent(max(d for d, _ in taps) + 200, frame_rate=seg.frame_rate)
    for delay, db in taps:
        out = out.overlay(seg + db, position=delay)
    return out


def apply_fx(seg: AudioSegment, fx: str | None) -> AudioSegment:
    """phone: qua điện thoại; whisper: thì thầm; far: ở xa/phòng bên; radio: loa thông báo; echo: phòng vang."""
    if not fx:
        return seg
    fx = fx.strip().lower()
    if fx == "phone":
        return (seg.high_pass_filter(350).low_pass_filter(3200) + 4).compress_dynamic_range() if hasattr(
            seg, "compress_dynamic_range") else seg.high_pass_filter(350).low_pass_filter(3200) + 4
    if fx == "whisper":
        return seg.high_pass_filter(600) - 9
    if fx == "far":
        return _echo(seg.low_pass_filter(2200) - 9, ((90, -10), (190, -16)))
    if fx == "radio":
        return _echo(seg.high_pass_filter(450).low_pass_filter(4200) + 2, ((140, -12), (300, -18), (480, -24)))
    if fx == "echo":
        return _echo(seg, ((180, -9), (360, -14), (540, -20)))
    raise ValueError(f"Hiệu ứng không hỗ trợ: {fx} (dùng {', '.join(FX_NAMES)})")


def apply_scenes(speech: AudioSegment, scenes: list[dict], crossfade_ms: int = 900) -> AudioSegment:
    """Âm nền theo cảnh: mỗi mục {start_ms, layers: [{path, db}]} có hiệu lực tới cảnh kế tiếp (layers rỗng = tắt)."""
    if not scenes:
        return speech
    scenes = sorted(scenes, key=lambda s: s["start_ms"])
    out = speech
    for i, sc in enumerate(scenes):
        start = max(0, int(sc["start_ms"]))
        end = int(scenes[i + 1]["start_ms"]) if i + 1 < len(scenes) else len(speech)
        if end - start < 200:
            continue
        for layer in sc.get("layers", []):
            bed = AudioSegment.from_file(layer["path"])
            bed = bed.set_frame_rate(speech.frame_rate).set_channels(speech.channels).set_sample_width(speech.sample_width)
            if len(bed) == 0:
                continue
            seg = (bed * (((end - start) // len(bed)) + 1))[: end - start] + float(layer.get("db", -20))
            fade = min(crossfade_ms, len(seg) // 2)
            out = out.overlay(seg.fade_in(fade).fade_out(fade), position=start)
    return out
