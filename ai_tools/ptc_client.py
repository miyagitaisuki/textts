"""Programmatic Tool Calling (PTC) client dùng chung cho textts trên Antigravity.

Tái sử dụng ``call_api``, ``_dialogue_body``, ``_ensure_aivis_running`` và
``ToolError`` từ ``mcp_server.py`` để luôn trả về JSON có cấu trúc cho script
Python đồng thời giữ chặt quy tắc chỉ dùng engine ``aivis``.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import mcp_server  # noqa: E402
from mcp_server import ToolError  # noqa: F401


def _assert_aivis(engine: str | None) -> str:
    chosen = engine or "aivis"
    if chosen != "aivis":
        raise ToolError(f"Chỉ được phép dùng engine='aivis' (nhận {chosen!r})")
    return "aivis"


class TexttsClient:
    """Client Python mỏng trả về JSON cấu trúc từ textts REST API."""

    def __init__(self, api_url: str | None = None):
        if api_url:
            mcp_server.API_URL = api_url.rstrip("/")
        self.api_url = mcp_server.API_URL

    def call_text_tool(self, tool_name: str, **kwargs: Any) -> str:
        """Gọi handler trả chuỗi gốc của MCP server nếu cần văn bản tóm tắt."""
        handler = mcp_server.HANDLERS.get(tool_name)
        if not handler:
            raise ToolError(f"Không có công cụ textts {tool_name!r}")
        return handler(kwargs)

    def status(self) -> dict[str, Any]:
        return mcp_server.call_api("GET", "/api/v1/health")

    def ensure_ready(self) -> dict[str, Any]:
        """Kiểm tra textts API và tự bật AivisSpeech nếu chưa chạy."""
        h = self.status()
        if not h.get("aivis_connected") and not os.environ.get("TEXTTS_NO_AUTOSTART"):
            mcp_server._ensure_aivis_running()
            h = self.status()
        return h

    def list_voices(self) -> list[dict[str, Any]]:
        res = mcp_server.call_api("GET", "/api/v1/speakers?engine=aivis")
        return res.get("speakers") or []

    def find_voices(self, query: str | None = None) -> list[dict[str, Any]]:
        params: dict[str, str] = {"engine": "aivis"}
        if query:
            params["q"] = query
        res = mcp_server.call_api("GET", "/api/v1/voice-bank?" + urllib.parse.urlencode(params))
        return res.get("items") or []

    def list_sounds(self, *, kind: str | None = None, query: str | None = None) -> list[dict[str, Any]]:
        if kind not in (None, "", "bgm", "sfx"):
            raise ToolError("kind phải là 'bgm' hoặc 'sfx'")
        params = {k: v for k, v in (("kind", kind), ("q", query)) if v}
        qs = ("?" + urllib.parse.urlencode(params)) if params else ""
        res = mcp_server.call_api("GET", f"/api/v1/sounds{qs}")
        return res.get("items") or []

    def check_script(self, script: str, level: str | None = None) -> dict[str, Any]:
        text = str(script or "").strip()
        if not text:
            raise ToolError("script trống")
        body: dict[str, Any] = {"script": text}
        if level:
            body["level"] = level
        return mcp_server.call_api("POST", "/api/v1/preview-script", body)

    def create_audio(
        self,
        *,
        title: str,
        script: str,
        roles: dict[str, dict[str, Any]] | None = None,
        level: str | None = None,
        bgm: Any = None,
        bgm_db: float | None = None,
        slow: bool = True,
        srt: bool = True,
        worksheet: bool = False,
        auto_qc: bool = True,
        filename: str | None = None,
        fmt: str = "mp3",
        engine: str = "aivis",
        timeout: float = 900,
    ) -> dict[str, Any]:
        _assert_aivis(engine)
        args: dict[str, Any] = {
            "title": title,
            "script": script,
            "engine": "aivis",
            "slow": slow,
            "srt": srt,
            "worksheet": worksheet,
            "auto_qc": auto_qc,
            "format": fmt,
        }
        if roles:
            args["roles"] = roles
        if level:
            args["level"] = level
        if bgm is not None:
            args["bgm"] = bgm
        if bgm_db is not None:
            args["bgm_db"] = bgm_db
        if filename:
            args["filename"] = filename
        body = mcp_server._dialogue_body(args)
        return mcp_server.call_api("POST", "/api/v1/dialogue", body, timeout=timeout)

    def create_exam(
        self,
        *,
        title: str,
        mondai: list[dict[str, Any]],
        roles: dict[str, dict[str, Any]] | None = None,
        level: str | None = None,
        bell: bool = True,
        auto_qc: bool = True,
        filename: str | None = None,
        fmt: str = "mp3",
        engine: str = "aivis",
        timeout: float = 1800,
    ) -> dict[str, Any]:
        _assert_aivis(engine)
        body: dict[str, Any] = {
            "title": str(title or "JLPT 聴解"),
            "engine": "aivis",
            "format": fmt,
            "bell": bool(bell),
            "auto_qc": bool(auto_qc),
            "mondai": mondai,
        }
        if filename:
            body["filename"] = filename
        if level:
            body["level"] = level
        if roles:
            body["roles"] = {
                str(k): {kk: vv for kk, vv in v.items() if vv is not None}
                for k, v in roles.items()
            }
        return mcp_server.call_api("POST", "/api/v1/exam", body, timeout=timeout)

    def check_audio(
        self,
        *,
        script: str,
        roles: dict[str, dict[str, Any]] | None = None,
        engine: str = "aivis",
        timeout: float = 1800,
    ) -> dict[str, Any]:
        _assert_aivis(engine)
        body = {
            k: v
            for k, v in mcp_server._dialogue_body({"script": script, "engine": "aivis", "roles": roles}).items()
            if k in ("script", "engine", "roles")
        }
        return mcp_server.call_api("POST", "/api/v1/check-audio", body, timeout=timeout)

    def list_characters(self) -> list[dict[str, Any]]:
        return mcp_server.call_api("GET", "/api/v1/characters?engine=aivis").get("items") or []

    def list_readings(self) -> dict[str, Any]:
        return mcp_server.call_api("GET", "/api/v1/readings")

    def add_reading(self, word: str, reading: str, accent: int | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"word": word, "reading": reading}
        if accent is not None:
            body["accent"] = accent
        return mcp_server.call_api("POST", "/api/v1/readings", body)

    def list_outputs(self, query: str | None = None) -> dict[str, Any]:
        q = f"?q={urllib.parse.quote(query)}" if query else ""
        return mcp_server.call_api("GET", f"/api/v1/outputs{q}")

    def get_output(self, name: str) -> dict[str, Any]:
        return mcp_server.call_api("GET", f"/api/v1/outputs/{urllib.parse.quote(name, safe='')}")


if __name__ == "__main__":
    client = TexttsClient()
    print(json.dumps(client.status(), ensure_ascii=False, indent=2))
