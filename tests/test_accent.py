import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

from core.parser import ScriptError, parse_script
from core.readings import load_engine_dict
from providers.aivis import apply_accent, parse_accent, sync_user_dict, to_katakana


def test_parse_accent_formats():
    assert parse_accent("2") == [2]
    assert parse_accent("2/0") == [2, 0]
    with pytest.raises(ValueError):
        parse_accent("abc")
    with pytest.raises(ValueError):
        parse_accent("-1")


def test_apply_accent_writes_each_phrase():
    query = {"accent_phrases": [{"moras": [{}, {}, {}]}, {"moras": [{}, {}]}]}
    apply_accent(query, "2/0")
    assert [p["accent"] for p in query["accent_phrases"]] == [2, 0]


def test_apply_accent_skips_on_phrase_count_mismatch(caplog):
    query = {"accent_phrases": [{"moras": [{}, {}]}]}
    apply_accent(query, "1/0")
    assert "accent" not in query["accent_phrases"][0]


def test_apply_accent_skips_when_accent_exceeds_moras():
    query = {"accent_phrases": [{"moras": [{}, {}]}]}
    apply_accent(query, "5")
    assert "accent" not in query["accent_phrases"][0]


def test_to_katakana():
    assert to_katakana("にほんご") == "ニホンゴ"
    assert to_katakana("ひさしぶり") == "ヒサシブリ"


def test_parser_keeps_valid_accent_attr():
    items = parse_script("[1]{accent=2/0} おはようございます。")
    assert items[0]["attrs"]["accent"] == "2/0"


def test_parser_rejects_bad_accent_attr():
    with pytest.raises(ScriptError):
        parse_script("[1]{accent=x} おはよう。")


def test_load_engine_dict(tmp_path):
    f = tmp_path / "d.yaml"
    f.write_text("駅: {reading: えき, accent: 0}\n", encoding="utf-8")
    assert load_engine_dict(f) == {"駅": ("えき", 0)}


def test_load_engine_dict_rejects_missing_fields(tmp_path):
    f = tmp_path / "d.yaml"
    f.write_text("駅: えき\n", encoding="utf-8")
    with pytest.raises(ValueError):
        load_engine_dict(f)


class _DictHandler(BaseHTTPRequestHandler):
    entries: dict = {}
    calls: list = []

    def _send(self, obj=None):
        body = json.dumps(obj if obj is not None else {}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        _DictHandler.calls.append(("GET", self.path))
        self._send(_DictHandler.entries)

    def do_POST(self):
        q = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        _DictHandler.calls.append(("POST", q))
        self._send("new-uuid")

    def do_DELETE(self):
        _DictHandler.calls.append(("DELETE", self.path))
        self._send()

    def log_message(self, *args):
        pass


def test_sync_user_dict_replaces_own_entries():
    _DictHandler.entries = {
        "u1": {"surface": "駅"},
        "u2": {"surface": "他の単語"},
    }
    _DictHandler.calls = []
    server = HTTPServer(("127.0.0.1", 0), _DictHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{server.server_port}"
        n = asyncio.run(sync_user_dict({"駅": ("えき", 0)}, base_url=url))
    finally:
        server.shutdown()

    assert n == 1
    deletes = [c for c in _DictHandler.calls if c[0] == "DELETE"]
    assert deletes == [("DELETE", "/user_dict_word/u1")]  # không đụng vào từ khác
    posts = [c[1] for c in _DictHandler.calls if c[0] == "POST"]
    assert posts == [{"surface": "駅", "pronunciation": "エキ", "accent_type": "0"}]
