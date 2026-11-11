"""Ghép các đoạn âm thanh theo thứ tự, chèn khoảng nghỉ và xuất phụ đề."""
from __future__ import annotations

from pydub import AudioSegment
from pydub.silence import detect_leading_silence

from core.audio import apply_fx

DEFAULT_TIMING = {
    "lead_in_ms": 2000,
    "turn_gap_ms": 600,
    "same_speaker_gap_ms": 400,
    "question_gap_ms": 200,
    "tail_ms": 2000,
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
    markers: list[dict] | None = None,
) -> tuple[AudioSegment, list[dict]]:
    """Ghép `items` đã có khóa `audio` (đường dẫn WAV) hoặc `pause`.

    `role_gains` là mixer: độ lệch dB cho từng vai (mặc định 0).
    Trả về (âm thanh, danh sách mục đã gắn `start_ms`/`end_ms`) để dựng phụ đề.
    `markers` (nếu truyền) nhận thêm vị trí các hiệu ứng sfx để giao diện vẽ track SFX.
    """
    t = {**DEFAULT_TIMING, **(timing or {})}
    gains = role_gains or {}
    out = AudioSegment.silent(t["lead_in_ms"])
    prev_role: str | None = None
    prev_plain: str | None = None
    placed: list[dict] = []
    pending_overlays: list[AudioSegment] = []  # sfx overlay chờ trộn tại vị trí câu kế tiếp

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
        if it["type"] == "bgm":
            # Cảnh mới: âm nền đổi từ đây (được trộn sau khi ghép xong, xem core.audio.apply_scenes)
            if markers is not None:
                markers.append({"id": it.get("id", ""), "type": "scene", "start_ms": len(out),
                                "layers": it.get("resolved_layers", [])})
            continue
        if it["type"] == "sfx":
            sfx = AudioSegment.from_file(it["path"]) + float(it.get("volume_db") or 0)
            start = len(out)
            if it.get("overlay"):
                # chồng lên câu kế tiếp: không chiếm thời gian, lời thoại bắt đầu cùng lúc
                pending_overlays.append(sfx)
                end = start + len(sfx)
            else:
                out += sfx
                end = len(out)
                prev_role = None
                prev_plain = None
            if markers is not None:
                markers.append({"id": it.get("id", ""), "type": "sfx", "path": str(it["path"]),
                                "start_ms": start, "end_ms": end, "overlay": bool(it.get("overlay"))})
            continue

        seg = AudioSegment.from_file(it["audio"])
        seg = trim_edges(seg)
        attrs = it.get("attrs") or {}
        seg = apply_fx(seg, attrs.get("fx"))
        gain = gains.get(it["role"], 0.0) + _num(attrs.get("vol"))
        if gain:
            seg = seg + gain
        overlap = int(_num(attrs.get("overlap")))

        if overlap > 0 and placed:
            # Nói chen: bắt đầu trước khi câu trước kết thúc (không sớm hơn đầu câu trước)
            start = max(placed[-1]["start_ms"], len(out) - overlap)
        else:
            if prev_role is not None:
                gap = t["same_speaker_gap_ms"] if it["role"] == prev_role else t["turn_gap_ms"]
                if prev_plain and prev_plain.rstrip().endswith(("？", "?")):
                    gap += t["question_gap_ms"]  # chờ trả lời sau câu hỏi
                out += AudioSegment.silent(gap)
            start = len(out)
        if it.get("delay_ms"):
            start += it["delay_ms"]
        end = start + len(seg)
        if end > len(out):
            out += AudioSegment.silent(end - len(out), frame_rate=out.frame_rate)
        out = out.overlay(seg, position=start)
        for ov in pending_overlays:
            if start + len(ov) > len(out):
                out += AudioSegment.silent(start + len(ov) - len(out), frame_rate=out.frame_rate)
            out = out.overlay(ov, position=start)
        pending_overlays.clear()
        placed.append({**it, "start_ms": start, "end_ms": end})
        prev_role = it["role"]
        prev_plain = it.get("plain", "")

    for ov in pending_overlays:  # sfx overlay ở cuối bài: phát luôn tại chỗ
        out += ov
    out += AudioSegment.silent(t["tail_ms"])
    return out, placed


def _num(v) -> float:
    try:
        return float(v) if v not in (None, "") else 0.0
    except (TypeError, ValueError):
        return 0.0


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
