"""Hai yêu cầu cùng khóa cache chạy song song không được làm hỏng nhau (trước đây tranh nhau một file .part)."""

import asyncio
from pathlib import Path

from providers.base import SynthRequest, TTSProvider
from tts import synth_cached


class _StreamingProvider(TTSProvider):
    name = "fake-stream"
    ext = "wav"

    async def synthesize(self, req, out_path):
        # Giống engine HTTP: mở file rồi ghi từng khúc, có await ở giữa.
        with open(out_path, "wb") as f:
            for _ in range(3):
                await asyncio.sleep(0.01)
                f.write(b"chunk" * 10)


def test_concurrent_identical_requests_do_not_clash(tmp_path: Path):
    provider = _StreamingProvider.__new__(_StreamingProvider)
    req = SynthRequest(text="同じ文", voice="v1")

    async def run():
        return await asyncio.gather(*(synth_cached(provider, req, tmp_path) for _ in range(5)), return_exceptions=True)

    results = asyncio.run(run())
    assert not [r for r in results if isinstance(r, Exception)], results
    assert len({r for r in results}) == 1
    assert results[0].stat().st_size == 150
    assert not list(tmp_path.glob("*.part"))
