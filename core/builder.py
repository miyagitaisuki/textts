"""Ghép các đoạn âm thanh theo thứ tự, chèn khoảng nghỉ và xuất phụ đề."""
from __future__ import annotations

from pydub import AudioSegment, effects

DEFAULT_TIMING = {
    "lead_in_ms": 300,
    "turn_gap_ms": 450,
    "same_speaker_gap_ms": 200,
    "tail_ms": 500,
}


def _fmt_srt_time(ms: int) -> str:
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build(
    items: list[dict],
    timing: dict | None = None,
    role_gains: dict[str, float] | None = None,
) -> tuple[AudioSegment, list[dict]]:
    """Ghép `items` đã có khóa `audio` (đường dẫn WAV) hoặc `pause`.

    `role_gains` là mixer: độ lệch dB cho từng vai (mặc định 0).
    Trả về (âm thanh, danh sách mục đã gắn `start_ms`/`end_ms`) để dựng phụ đề.
    """
    t = {**DEFAULT_TIMING, **(timing or {})}
    gains = role_gains or {}
    out = AudioSegment.silent(t["lead_in_ms"])
    prev_role: str | None = None
    placed: list[dict] = []

    for it in items:
        if it["type"] == "pause":
            out += AudioSegment.silent(it["ms"])
            prev_role = None
            continue
        if it["type"] == "sfx":
            out += AudioSegment.from_file(it["path"])
            prev_role = None
            continue

        seg = AudioSegment.from_file(it["audio"])
        seg = effects.strip_silence(seg, silence_len=150, silence_thresh=-45, padding=40)
        gain = gains.get(it["role"], 0.0)
        if gain:
            seg = seg + gain

        if prev_role is not None:
            gap = t["same_speaker_gap_ms"] if it["role"] == prev_role else t["turn_gap_ms"]
            if it["plain"].rstrip().endswith(("？", "?")):
                gap += 100  # chờ trả lời sau câu hỏi
            out += AudioSegment.silent(gap)
        if it.get("delay_ms"):
            out += AudioSegment.silent(it["delay_ms"])

        start = len(out)
        out += seg
        placed.append({**it, "start_ms": start, "end_ms": len(out)})
        prev_role = it["role"]

    out += AudioSegment.silent(t["tail_ms"])
    return out, placed


def to_srt(placed: list[dict]) -> str:
    blocks = []
    for n, it in enumerate(placed, 1):
        blocks.append(
            f"{n}\n{_fmt_srt_time(it['start_ms'])} --> {_fmt_srt_time(it['end_ms'])}\n"
            f"[{it['role']}] {it['plain']}\n"
        )
    return "\n".join(blocks)
