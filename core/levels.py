"""Nhịp đọc theo trình độ JLPT: N5 chậm và nghỉ lâu, N1 gần tốc độ người bản xứ."""
from __future__ import annotations

LEVELS: dict[str, dict] = {
    # rate: tốc độ đọc cả bài (time-stretch, giữ cao độ); các khoảng lặng tính bằng ms
    "N5": {"rate": 0.85, "turn_gap_ms": 900, "same_speaker_gap_ms": 600, "question_gap_ms": 300, "sentence_pause_ms": 700},
    "N4": {"rate": 0.92, "turn_gap_ms": 750, "same_speaker_gap_ms": 500, "question_gap_ms": 250, "sentence_pause_ms": 600},
    "N3": {"rate": 1.0, "turn_gap_ms": 600, "same_speaker_gap_ms": 400, "question_gap_ms": 200, "sentence_pause_ms": 500},
    "N2": {"rate": 1.05, "turn_gap_ms": 500, "same_speaker_gap_ms": 350, "question_gap_ms": 150, "sentence_pause_ms": 400},
    "N1": {"rate": 1.1, "turn_gap_ms": 400, "same_speaker_gap_ms": 300, "question_gap_ms": 100, "sentence_pause_ms": 350},
}

# Gợi ý cho AI khi soạn kịch bản theo trình độ
GUIDE = {
    "N5": "câu ngắn (≤ 12 từ), thể です/ます, từ vựng cơ bản, chú âm mọi chữ Hán ngoài ~100 chữ N5",
    "N4": "câu ngắn-vừa, có て形/たい/ことができる, kính ngữ đơn giản, chú âm chữ Hán ngoài N5-N4",
    "N3": "hội thoại tự nhiên, thể thường xen lịch sự, rút gọn (～ちゃう, ～てる), chú âm chữ khó",
    "N2": "tốc độ gần tự nhiên, kính ngữ/khiêm nhường ngữ, từ nối, ý ngầm",
    "N1": "tốc độ tự nhiên, thành ngữ, nói tắt, lối nói gián tiếp",
}


def timing_for(level: str | None, base: dict) -> tuple[dict, float]:
    """Trả về (timing đã áp trình độ, tốc độ đọc). Không có trình độ: giữ nguyên, tốc độ 1.0."""
    if not level:
        return base, 1.0
    preset = LEVELS[level.upper()]
    return {**base, **{k: v for k, v in preset.items() if k != "rate"}}, preset["rate"]
