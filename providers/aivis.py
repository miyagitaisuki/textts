"""Engine AivisSpeech (chạy offline bằng CPU/DirectML, API tương thích VOICEVOX).

AivisSpeech Engine hỗ trợ các model phong cách Style-BERT-VITS2 như bộ JVNV (jvnv-F1, F2, M1, M2).
Mỗi giọng có các style diễn cảm khác nhau (ノーマル, 幸せ, 悲しみ, 怒り, 驚き, v.v.).

Điểm lưu ý kỹ thuật:
- `intonationScale`: độ mạnh cảm xúc của style (0-2). Style ノーマル bỏ qua giá trị này.
- `pitchScale`: không dùng vì làm giảm chất lượng tổng hợp của Style-BERT-VITS2; giữ nguyên từ audio_query.
- `style_id`: số nguyên 32-bit, được tra cứu động từ /speakers theo tên nhân vật và cảm xúc mong muốn.
"""
from __future__ import annotations

import logging
import re
import os
from pathlib import Path
from typing import Any

import aiohttp

from providers.base import SynthRequest, TTSProvider

logger = logging.getLogger(__name__)

DEFAULT_URL = "http://127.0.0.1:10101"
SPEED_SCALE = {"slow": 0.85, "normal": 1.0, "fast": 1.15}
EMOTION_STRENGTH = 1.2

EMOTION_STYLE: dict[str, str] = {
    "neutral": "ノーマル",
    "happy": "幸せ",
    "sad": "悲しみ",
    "angry": "怒り",
    "surprised": "驚き",
}


class AivisProvider(TTSProvider):
    name = "aivis"
    ext = "wav"
    cache_salt = f"v1-{EMOTION_STRENGTH}"
    supports_pause_scale = True

    def __init__(self, base_url: str | None = None, timeout: float = 60.0):
        self.base_url = (base_url or os.environ.get("AIVIS_URL") or DEFAULT_URL).rstrip("/")
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self._speakers_cache: dict[str, tuple[dict[str, Any], dict[str, int]]] | None = None

    async def _ensure_speakers(self, session: aiohttp.ClientSession) -> dict[str, tuple[dict[str, Any], dict[str, int]]]:
        if self._speakers_cache is not None:
            return self._speakers_cache

        async with session.get(f"{self.base_url}/speakers") as resp:
            resp.raise_for_status()
            speakers = await resp.json()

        cache: dict[str, tuple[dict[str, Any], dict[str, int]]] = {}
        for spk in speakers:
            styles = spk.get("styles", [])
            style_map = {s["name"]: s["id"] for s in styles if "name" in s and "id" in s}
            for s in styles:
                if "id" in s:
                    cache[str(s["id"])] = (spk, style_map)

        self._speakers_cache = cache
        return cache

    def _resolve_style(
        self,
        speakers_cache: dict[str, tuple[dict[str, Any], dict[str, int]]],
        voice_id: str,
        emotion: str,
    ) -> tuple[int | str, str]:
        """Tìm style_id phù hợp với emotion từ cùng một nhân vật sở hữu voice_id."""
        target_style_name = EMOTION_STYLE.get(emotion, "ノーマル")
        info = speakers_cache.get(str(voice_id))
        if not info:
            logger.warning("Không tìm thấy thông tin giọng %s trong danh sách speakers; giữ nguyên ID.", voice_id)
            return (int(voice_id) if str(voice_id).isdigit() else voice_id, "ノーマル")

        spk, style_map = info
        if target_style_name in style_map:
            return (style_map[target_style_name], target_style_name)

        logger.warning(
            "Nhân vật %s không có style %r; dùng lại giọng gốc %s.",
            spk.get("name", voice_id),
            target_style_name,
            voice_id,
        )
        return (int(voice_id) if str(voice_id).isdigit() else voice_id, "ノーマル")

    async def synthesize(self, req: SynthRequest, out_path: str) -> None:
        if req.speed not in SPEED_SCALE:
            raise ValueError(f"speed không hợp lệ: {req.speed!r}")

        async with aiohttp.ClientSession(timeout=self.timeout) as session:
            speakers_cache = await self._ensure_speakers(session)
            final_style_id, chosen_style = self._resolve_style(speakers_cache, req.voice, req.emotion)

            # 1. Tạo audio query
            params = {"text": req.text, "speaker": str(final_style_id)}
            async with session.post(f"{self.base_url}/audio_query", params=params) as resp:
                resp.raise_for_status()
                query = await resp.json()

            # 2. Điều chỉnh thông số
            query["speedScale"] = SPEED_SCALE[req.speed]
            if "pauseLengthScale" in query:
                query["pauseLengthScale"] = req.pause_scale
            if chosen_style != "ノーマル":
                query["intonationScale"] = EMOTION_STRENGTH
            if req.accent:
                apply_accent(query, req.accent)
            if req.tempo != 1.0:
                query["tempoDynamicsScale"] = req.tempo

            # 3. Tổng hợp âm thanh
            async with session.post(
                f"{self.base_url}/synthesis",
                params={"speaker": str(final_style_id)},
                json=query,
            ) as resp:
                resp.raise_for_status()
                data = await resp.read()

        Path(out_path).write_bytes(data)


async def list_speakers(
    base_url: str | None = None,
    timeout: float = 10.0,
    *,
    only_normal: bool = False,
) -> list[dict[str, str]]:
    """Lấy danh sách giọng từ AivisSpeech Engine /speakers.
    
    Nếu `only_normal=True`, chỉ trả về style "ノーマル" của mỗi nhân vật để dùng cho việc chọn giọng vai.
    """
    url = (base_url or os.environ.get("AIVIS_URL") or DEFAULT_URL).rstrip("/")
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
        async with session.get(f"{url}/speakers") as resp:
            resp.raise_for_status()
            data = await resp.json()

    voices: list[dict[str, str]] = []
    for speaker in data:
        styles = speaker.get("styles", [])
        if only_normal:
            styles = [s for s in styles if s.get("name") == "ノーマル"] or styles[:1]
        for style in styles:
            voices.append({
                "value": str(style["id"]),
                "label": f'{speaker["name"]} ({style["name"]})',
            })
    return voices


ACCENT_SPEC_RE = re.compile(r"^\d+(/\d+)*$")
HIRA_TO_KATA_OFFSET = ord("ァ") - ord("ぁ")


def parse_accent(spec: str) -> list[int]:
    """"2/0" -> [2, 0]: vị trí accent (số mora, 0 = bằng) của từng cụm theo thứ tự."""
    if not ACCENT_SPEC_RE.match(spec.strip()):
        raise ValueError(f"accent không hợp lệ: {spec!r} (dạng đúng: 2 hoặc 2/0)")
    return [int(x) for x in spec.strip().split("/")]


def apply_accent(query: dict[str, Any], spec: str) -> None:
    """Ghi accent vào từng cụm trong audio_query. Lệch số cụm thì cảnh báo và bỏ qua."""
    accents = parse_accent(spec)
    phrases = query.get("accent_phrases", [])
    if len(accents) != len(phrases):
        logger.warning(
            "accent=%s có %d cụm nhưng câu có %d cụm; bỏ qua accent.", spec, len(accents), len(phrases)
        )
        return
    for phrase, accent in zip(phrases, accents):
        moras = len(phrase.get("moras", []))
        if accent > moras:
            logger.warning("accent %d vượt quá số mora (%d) của cụm; bỏ qua accent.", accent, moras)
            return
    for phrase, accent in zip(phrases, accents):
        phrase["accent"] = accent


def to_katakana(text: str) -> str:
    return "".join(
        chr(ord(c) + HIRA_TO_KATA_OFFSET) if "ぁ" <= c <= "ゖ" else c for c in text
    )


async def sync_user_dict(
    words: dict[str, tuple[str, int]],
    base_url: str | None = None,
    timeout: float = 10.0,
) -> int:
    """Thay toàn bộ từ điển riêng của engine bằng `words` (từ -> (cách đọc kana, accent_type)).

    Trả về số từ đã đăng ký. Chỉ xóa các mục do chính hàm này thêm (theo surface trùng khớp),
    nên không ảnh hưởng các từ người dùng tự đăng ký trên AivisSpeech.
    """
    url = (base_url or os.environ.get("AIVIS_URL") or DEFAULT_URL).rstrip("/")
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
        async with session.get(f"{url}/user_dict") as resp:
            resp.raise_for_status()
            existing = await resp.json()  # uuid -> {surface, ...}

        for uuid, entry in existing.items():
            if entry.get("surface") in words:
                async with session.delete(f"{url}/user_dict_word/{uuid}") as resp:
                    resp.raise_for_status()

        for surface, (reading, accent_type) in words.items():
            params = {
                "surface": surface,
                "pronunciation": to_katakana(reading),
                "accent_type": str(accent_type),
            }
            async with session.post(f"{url}/user_dict_word", params=params) as resp:
                resp.raise_for_status()
    return len(words)
