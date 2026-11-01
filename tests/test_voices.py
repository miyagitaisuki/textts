import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from providers.voicevox import list_speakers

SPEAKERS = [
    {"name": "四国めたん", "styles": [{"name": "ノーマル", "id": 2}, {"name": "あまあま", "id": 0}]},
    {"name": "ずんだもん", "styles": [{"name": "ノーマル", "id": 3}]},
]


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/speakers":
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps(SPEAKERS).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def test_list_speakers_flattens_styles():
    server = HTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f"http://127.0.0.1:{server.server_port}"
        voices = asyncio.run(list_speakers(url))
    finally:
        server.shutdown()
    assert voices == [
        {"value": "2", "label": "四国めたん (ノーマル)"},
        {"value": "0", "label": "四国めたん (あまあま)"},
        {"value": "3", "label": "ずんだもん (ノーマル)"},
    ]
