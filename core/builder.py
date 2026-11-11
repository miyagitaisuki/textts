"""Ghép các đoạn âm thanh theo thứ tự, chèn khoảng nghỉ và xuất phụ đề."""
from __future__ import annotations

from pydub import AudioSegment
from pydub.silence import detect_leading_silence

DEFAULT_TIMING = {
    "lead_in_ms": 300,
    "turn_gap_ms": 1400,
    "same_speaker_gap_ms": 800,
    "question_gap_ms": 300,
    "tail_ms": 500,
}


def trim_edges(seg: AudioSegment, pad_ms: int = 40, thresh_db: float = -45.0) -> AudioSegment:
    """Bỏ khoảng lặng ở đầu và cuối đoạn âm thanh, giữ lại `pad_ms` mỗi bên.

    Chỉ cắt hai đầu: khoảng dừng bên trong (sau 。 do textts chèn, hay chỗ ngắt ở 、 của engine)
    được giữ nguyên. Không dùng pydub.effects.strip_silence vì hàm đó xóa cả khoảng lặng ở giữa.
    """
    start = max(0, detect_leading_silence(seg, silence_threshold=thresh_db) - pad_ms)
    tail = max(0, detect_leading_silence(seg.reverse(), silence_threshold=thresh_db) - pad_ms)
    end = max(start, len(seg) - tail)
    return seg[start:end]


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
    prev_plain: str | None = None
    placed: list[dict] = []

    for it in items:
        if it["type"] == "pause":
            pause_role = it.get("role")
            if pause_role is not None and prev_role is not None:
                gap = t["same_speaker_gap_ms"] if pause_role == prev_role else t["turn_gap_ms"]
                if prev_plain and prev_plain.rstrip().endswith(("？", "?")):
                    gap += t["question_gap_ms"]
                out += AudioSegment.silent(gap)
            out += AudioSegment.silent(it["ms"])
            prev_role = pause_role
            prev_plain = None
            continue
        if it["type"] == "sfx":
            out += AudioSegment.from_file(it["path"])
            prev_role = None
            prev_plain = None
            continue

        seg = AudioSegment.from_file(it["audio"])
        seg = trim_edges(seg)
        gain = gains.get(it["role"], 0.0)
        if gain:
            seg = seg + gain

        if prev_role is not None:
            gap = t["same_speaker_gap_ms"] if it["role"] == prev_role else t["turn_gap_ms"]
            if prev_plain and prev_plain.rstrip().endswith(("？", "?")):
                gap += t["question_gap_ms"]  # chờ trả lời sau câu hỏi
            out += AudioSegment.silent(gap)
        if it.get("delay_ms"):
            out += AudioSegment.silent(it["delay_ms"])

        start = len(out)
        out += seg
        placed.append({**it, "start_ms": start, "end_ms": len(out)})
        prev_role = it["role"]
        prev_plain = it.get("plain", "")

    out += AudioSegment.silent(t["tail_ms"])
    return out, placed


def practice_items(
    items: list[dict],
    placed: list[dict],
    *,
    practice_role: str | None = None,
    shadow_gap_ms: int | None = None,
) -> list[dict]:
    """Biến danh sách mục để xuất bản luyện tập từ kết quả `build` lần đầu.

    - `practice_role`: giữ lời thoại của vai này; câu của vai khác thành khoảng lặng cùng độ dài.
    - `shadow_gap_ms`: sau mỗi câu luyện tập chèn thêm khoảng lặng này để học viên nhắc lại.
    Độ dài lấy từ `placed` (có `id`, `start_ms`, `end_ms`) nên phải gọi `build` trước.
    """
    durations = {p["id"]: p["end_ms"] - p["start_ms"] for p in placed}
    out: list[dict] = []
    for it in items:
        if it["type"] != "line":
            out.append(it)
            continue
        dur = durations.get(it["id"], 0)
        is_practice = practice_role is None or it["role"] == practice_role
        if not is_practice:
            out.append({"type": "pause", "ms": dur, "role": it["role"]})
            continue
        out.append(it)
        if shadow_gap_ms is not None:
            out.append({"type": "pause", "ms": dur + shadow_gap_ms})
    return out


def to_srt(placed: list[dict]) -> str:
    blocks = []
    for n, it in enumerate(placed, 1):
        blocks.append(
            f"{n}\n{_fmt_srt_time(it['start_ms'])} --> {_fmt_srt_time(it['end_ms'])}\n"
            f"[{it['role']}] {it['plain']}\n"
        )
    return "\n".join(blocks)
