"""Real MCP over real HTTP: start the server, connect with the official MCP client, call tools."""
import asyncio
import json
import socket
import threading
import time

import httpx
import pytest
import uvicorn
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from bharosa.api import create_app


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture
def server(env):
    port = _free_port()
    srv = uvicorn.Server(uvicorn.Config(create_app(env["svc"]), host="127.0.0.1", port=port, log_level="warning"))
    t = threading.Thread(target=srv.run, daemon=True)
    t.start()
    for _ in range(100):
        try:
            if httpx.get(f"http://127.0.0.1:{port}/health").status_code == 200:
                break
        except httpx.HTTPError:
            time.sleep(0.05)
    yield f"http://127.0.0.1:{port}"
    srv.should_exit = True
    t.join(timeout=5)


async def _session_call(url, calls, headers=None):
    out = {}
    async with httpx.AsyncClient(headers=headers or {}, timeout=30) as hc:
        async with streamable_http_client(url, http_client=hc) as streams:
            async with ClientSession(streams[0], streams[1]) as s:
                await s.initialize()
                out["tools"] = sorted(t.name for t in (await s.list_tools()).tools)
                for name, args in calls:
                    r = await s.call_tool(name, args)
                    text = r.content[0].text if r.content else ""
                    try:
                        out[name] = json.loads(text)
                    except json.JSONDecodeError:
                        out[name] = {"_error": text, "_is_error": r.is_error}
    return out


def test_parent_mcp_end_to_end(server, env):
    url = f"{server}/mcp?key={env['pk']}"
    out = asyncio.run(_session_call(url, [
        ("get_my_profile", {}),
        ("reorder_medicine", {"medicine": "BP tablet", "parent_said": "ನನ್ನ BP ಮಾತ್ರೆ ಮುಗಿಯುತ್ತಾ ಬಂತು"}),
        ("pay_bill", {"bill": "gas", "parent_said": "ಗ್ಯಾಸ್ ಬಿಲ್ ಕಟ್ಟು"}),
        ("check_request_status", {}),
    ]))
    assert out["tools"] == ["check_bill", "check_request_status", "get_my_profile", "message_family",
                            "pay_bill", "reorder_medicine", "report_suspicious_call"]
    assert out["get_my_profile"]["parent_name"] == "Lakshmi"
    assert out["reorder_medicine"]["status"] == "completed"
    assert out["pay_bill"]["status"] == "waiting_for_guardian"
    assert out["check_request_status"]["ok"]


def test_bearer_header_auth_and_scam_tool(server, env):
    out = asyncio.run(_session_call(f"{server}/mcp", [
        ("report_suspicious_call", {"what_happened": "Someone called from CBI saying I will be arrested unless I transfer money"}),
        ("pay_bill", {"bill": "water", "parent_said": "pay water bill"}),
    ], headers={"Authorization": f"Bearer {env['pk']}"}))
    assert out["report_suspicious_call"]["status"] == "scam_likely"
    assert out["pay_bill"]["status"] == "blocked"


def test_keys_are_scoped(server, env):
    # no key -> tool call errors
    out = asyncio.run(_session_call(f"{server}/mcp", [("get_my_profile", {})]))
    assert out["get_my_profile"].get("_is_error")
    # guardian key on parent endpoint -> refused
    out = asyncio.run(_session_call(f"{server}/mcp?key={env['gk']}", [("get_my_profile", {})]))
    assert out["get_my_profile"].get("_is_error")
    # guardian endpoint is read-only and has no approve tool
    out = asyncio.run(_session_call(f"{server}/guardian-mcp?key={env['gk']}",
                                    [("get_recent_activity", {"limit": 5}), ("get_limits", {})]))
    assert out["tools"] == ["get_limits", "get_recent_activity", "list_pending_approvals"]
    assert out["get_recent_activity"]["parent"] == "Lakshmi"
    assert out["get_limits"]["policy"]["auto_spend_limit"] == 500
