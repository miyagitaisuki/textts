import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
import aiohttp

from providers.aivis import AivisProvider, EMOTION_STRENGTH
from providers.base import SynthRequest

MOCK_SPEAKERS = [
    {
        "name": "jvnv-F1",
        "speaker_uuid": "uuid-f1",
        "styles": [
            {"name": "ノーマル", "id": 888753760},
            {"name": "幸せ", "id": 888753761},
            {"name": "悲しみ", "id": 888753762},
            {"name": "怒り", "id": 888753763},
            {"name": "驚き", "id": 888753764},
        ],
    },
    {
        "name": "jvnv-M1",
        "speaker_uuid": "uuid-m1",
        "styles": [
            {"name": "ノーマル", "id": 888753770},
        ],
    },
]


class _AivisHandler(BaseHTTPRequestHandler):
    recorded_queries = []
    recorded_syntheses = []
    simulate_error = False

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/speakers":
            body = json.dumps(MOCK_SPEAKERS).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if _AivisHandler.simulate_error:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b"Server Error")
            return

        if parsed.path == "/audio_query":
            speaker = params.get("speaker", [""])[0]
            text = params.get("text", [""])[0]
            _AivisHandler.recorded_queries.append({"speaker": speaker, "text": text})

            query_data = {
                "text": text,
                "speedScale": 1.0,
                "pitchScale": 0.05,
                "intonationScale": 1.0,
                "kana": "テスト{かな}",
                "outputSamplingRate": 44100,
            }
            body = json.dumps(query_data).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif parsed.path == "/synthesis":
            speaker = params.get("speaker", [""])[0]
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            _AivisHandler.recorded_syntheses.append({"speaker": speaker, "payload": payload})

            dummy_wav = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00data\x00\x00\x00\x00"
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(dummy_wav)))
            self.end_headers()
            self.wfile.write(dummy_wav)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass


@pytest.fixture
def mock_aivis_server():
    _AivisHandler.recorded_queries = []
    _AivisHandler.recorded_syntheses = []
    _AivisHandler.simulate_error = False

    server = HTTPServer(("127.0.0.1", 0), _AivisHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}"
    try:
        yield url, _AivisHandler
    finally:
        server.shutdown()


def test_aivis_emotion_style_selection(mock_aivis_server, tmp_path):
    url, handler = mock_aivis_server
    provider = AivisProvider(base_url=url)
    out_file = tmp_path / "happy.wav"

    # voice là id của style "ノーマル" (888753760), emotion là "happy"
    req = SynthRequest(text="うれしい！", voice="888753760", emotion="happy", speed="normal")
    asyncio.run(provider.synthesize(req, str(out_file)))

    assert out_file.exists() and out_file.stat().st_size > 0
    # Phải gọi query và synthesis với id của style "幸せ" (888753761)
    assert len(handler.recorded_queries) == 1
    assert handler.recorded_queries[0]["speaker"] == "888753761"
    assert len(handler.recorded_syntheses) == 1
    assert handler.recorded_syntheses[0]["speaker"] == "888753761"

    payload = handler.recorded_syntheses[0]["payload"]
    assert payload["intonationScale"] == EMOTION_STRENGTH
    assert payload["speedScale"] == 1.0


def test_aivis_normal_style_preserves_intonation(mock_aivis_server, tmp_path):
    url, handler = mock_aivis_server
    provider = AivisProvider(base_url=url)
    out_file = tmp_path / "neutral.wav"

    # emotion là "neutral" -> style "ノーマル" (888753760)
    req = SynthRequest(text="こんにちは", voice="888753760", emotion="neutral", speed="normal")
    asyncio.run(provider.synthesize(req, str(out_file)))

    assert handler.recorded_queries[0]["speaker"] == "888753760"
    payload = handler.recorded_syntheses[0]["payload"]
    # Style ノーマル không bị sửa intonationScale (vẫn giữ 1.0 từ query)
    assert payload["intonationScale"] == 1.0


def test_aivis_missing_style_fallback(mock_aivis_server, tmp_path):
    url, handler = mock_aivis_server
    provider = AivisProvider(base_url=url)
    out_file = tmp_path / "fallback.wav"

    # jvnv-M1 (888753770) không có style "angry" (怒り) -> dùng lại id gốc
    req = SynthRequest(text="怒っています", voice="888753770", emotion="angry", speed="normal")
    asyncio.run(provider.synthesize(req, str(out_file)))

    assert handler.recorded_queries[0]["speaker"] == "888753770"
    assert handler.recorded_syntheses[0]["speaker"] == "888753770"


def test_aivis_speed_scale_and_preservation(mock_aivis_server, tmp_path):
    url, handler = mock_aivis_server
    provider = AivisProvider(base_url=url)

    # Chạy slow (0.85)
    out_file = tmp_path / "slow.wav"
    req = SynthRequest(text="ゆっくり", voice="888753760", emotion="neutral", speed="slow")
    asyncio.run(provider.synthesize(req, str(out_file)))
    payload = handler.recorded_syntheses[0]["payload"]
    assert payload["speedScale"] == 0.85
    # pitchScale và kana không bị đổi
    assert payload["pitchScale"] == 0.05
    assert payload["kana"] == "テスト{かな}"

    # Invalid speed
    bad_req = SynthRequest(text="エラー", voice="888753760", speed="superfast")
    with pytest.raises(ValueError, match="speed không hợp lệ"):
        asyncio.run(provider.synthesize(bad_req, str(tmp_path / "err.wav")))


def test_aivis_http_error_raised(mock_aivis_server, tmp_path):
    url, handler = mock_aivis_server
    handler.simulate_error = True
    provider = AivisProvider(base_url=url)

    req = SynthRequest(text="テスト", voice="888753760", emotion="neutral")
    with pytest.raises(aiohttp.ClientResponseError):
        asyncio.run(provider.synthesize(req, str(tmp_path / "err.wav")))
