"""End-to-end walkthrough against a running server, acting like the ElevenLabs agent would.

    python -m bharosa.cli serve &                 # in one terminal
    python scripts/demo_walkthrough.py http://localhost:8000

Creates a demo family, then over real MCP: reorders a medicine (auto), asks to pay a big bill
(waits for guardian), approves it through the one-tap link, reports a scam (spending locks),
and reads the guardian's read-only MCP view.
"""
import asyncio
import json
import sys

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

sys.path.insert(0, __file__.rsplit("/scripts/", 1)[0])
from bharosa.cli import demo_household_spec  # noqa: E402


async def mcp_calls(url, calls):
    results = []
    async with streamable_http_client(url) as streams:
        async with ClientSession(streams[0], streams[1]) as s:
            await s.initialize()
            for name, args in calls:
                r = await s.call_tool(name, args)
                results.append((name, json.loads(r.content[0].text) if not r.is_error else {"error": r.content[0].text}))
    return results


def show(step, name, res):
    print(f"\n── {step}: {name} → {res.get('status', '')}")
    if res.get("say_to_parent"):
        print("   🗣 ", res["say_to_parent"])
    if res.get("reasons"):
        print("   why:", "; ".join(res["reasons"]))


async def main(base):
    hh = httpx.post(f"{base}/api/households", json=demo_household_spec("kn")).raise_for_status().json()
    print("Guardian dashboard:", hh["guardian_dashboard"])
    print("Parent simulator:  ", hh["parent_simulator"])
    parent = hh["parent_mcp_url"].replace(hh["parent_mcp_url"].split("/mcp")[0], base)
    guardian = hh["guardian_mcp_url"].replace(hh["guardian_mcp_url"].split("/guardian-mcp")[0], base)

    res = await mcp_calls(parent, [
        ("get_my_profile", {}),
        ("reorder_medicine", {"medicine": "BP", "parent_said": "ನನ್ನ BP ಮಾತ್ರೆ ಮುಗಿಯುತ್ತಾ ಬಂತು"}),
        ("check_bill", {"bill": "ಕರೆಂಟ್ ಬಿಲ್"}),
        ("pay_bill", {"bill": "ಕರೆಂಟ್ ಬಿಲ್", "parent_said": "ಹೌದು, ಕರೆಂಟ್ ಬಿಲ್ ಕಟ್ಟಿ"}),
    ])
    for i, (n, r) in enumerate(res, 1):
        show(i, n, r)

    state = httpx.get(f"{base}/api/state", headers={"X-Bharosa-Key": hh["guardian_key"]}).json()
    pending = state["pending"]
    if pending:
        aid = pending[0]["id"]
        print(f"\n── Guardian approves '{pending[0]['title']}' from the dashboard")
        r = httpx.post(f"{base}/api/actions/{aid}/approve", headers={"X-Bharosa-Key": hh["guardian_key"]}).json()
        print("   →", r["status"], r.get("result", {}).get("receipt", ""))

    res = await mcp_calls(parent, [
        ("report_suspicious_call", {"what_happened": "CBI ಇಂದ ಫೋನ್ ಬಂತು, ದುಡ್ಡು ಕಳಿಸಬೇಕಂತೆ"}),
        ("pay_bill", {"bill": "water", "parent_said": "ನೀರಿನ ಬಿಲ್ ಕಟ್ಟಿ"}),
    ])
    for i, (n, r) in enumerate(res, 5):
        show(i, n, r)

    res = await mcp_calls(guardian, [("get_recent_activity", {"limit": 12})])
    print("\n── Guardian's own assistant (read-only MCP) sees:")
    for e in reversed(res[0][1]["events"]):
        print(f"   [{e['severity']:>7}] {e['what']}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:8000"))
