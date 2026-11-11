"""Tự kiểm tra phát âm: nghe lại từng câu bằng Whisper (nhận dạng giọng nói) rồi so với kịch bản.

So sánh trên cách đọc kana (pyopenjtalk) nên không bị lệch vì chữ Hán/kana khác nhau. Câu có độ khớp
thấp thường là chữ Hán bị đọc sai (cần chú âm 漢字{かな}) hoặc engine đọc lướt/nuốt chữ.
Cần gói faster-whisper; mô hình (~460 MB) tải về lần đầu dùng.
"""
from __future__ import annotations

import difflib
import re
import unicodedata

MODEL_SIZE = "small"
_model = None


class QCUnavailable(RuntimeError):
    pass


def _kana(text: str) -> str:
    """Cách đọc katakana của câu (bỏ dấu câu), để so khớp phát âm."""
    try:
        import pyopenjtalk

        k = pyopenjtalk.g2p(text, kana=True)
    except Exception:  # noqa: BLE001 - không có pyopenjtalk thì so trực tiếp chữ
        k = text
    k = unicodedata.normalize("NFKC", k)
    k = "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in k)  # hiragana -> katakana
    return re.sub(r"[^ァ-ヺー]", "", k)


def similarity(expected: str, heard: str) -> float:
    a, b = _kana(expected), _kana(heard)
    if not a and not b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _load():
    global _model
    if _model is None:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise QCUnavailable(
                "Chưa có gói faster-whisper để nghe lại. Cài: pip install faster-whisper "
                "(lần đầu sẽ tải mô hình nhận dạng ~460 MB)."
            ) from exc
        _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
    return _model


def transcribe(path: str) -> str:
    import numpy as np
    from pydub import AudioSegment

    seg = AudioSegment.from_file(path).set_channels(1).set_frame_rate(16000).set_sample_width(2)
    samples = np.frombuffer(seg.raw_data, dtype=np.int16).astype(np.float32) / 32768
    segments, _ = _load().transcribe(samples, language="ja", beam_size=5, vad_filter=False)
    return "".join(s.text for s in segments).strip()


def check_lines(lines: list[dict], threshold: float = 0.9, transcriber=None) -> list[dict]:
    """lines: [{id, text (kana/tts_text), display, audio}]. Trả về kết quả từng câu, câu đáng ngờ có ok=False."""
    transcriber = transcriber or transcribe
    out = []
    for ln in lines:
        heard = transcriber(ln["audio"])
        score = similarity(ln["text"], heard)
        out.append({
            "id": ln["id"], "display": ln.get("display", ln["text"]), "heard": heard,
            "score": round(score, 2), "ok": score >= threshold,
        })
    return out
