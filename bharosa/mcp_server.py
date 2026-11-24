"""Two MCP servers over one service, each with its own key and its own tools.

* /mcp            - for the parent's voice agent (ElevenLabs). Can *request* actions.
* /guardian-mcp   - for the guardian's own assistant (e.g. Claude). Read-only.

Approvals are deliberately NOT exposed over MCP: a human taps approve on their
own phone. No LLM, on either side, can approve a spend.
"""
from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import Context, MCPServer

from .service import BharosaService

PARENT_INSTRUCTIONS = """You are connected to Bharosa, which acts for an elderly parent.
Rules that the server enforces whatever you do:
- Every action is checked against limits set by the parent's family guardian.
- Small, known spends happen at once; bigger or unusual ones wait for the guardian.
- If a tool result has `say_to_parent`, say exactly that (it is in the parent's language).
- Always pass what the parent actually said in `parent_said`, word for word.
- If the parent mentions a call or message asking for money, an OTP, a PIN, an app install,
  or threats of arrest or disconnection, call `report_suspicious_call` immediately.
- Never ask the parent for an OTP, PIN, password or card number. Bharosa never needs them."""

GUARDIAN_INSTRUCTIONS = """Read-only view of a parent's Bharosa activity for their family guardian.
Approvals are done by the guardian on the Bharosa dashboard or approval link, not here."""


def _key(ctx: Context) -> str | None:
    headers = {k.lower(): v for k, v in (ctx.headers or {}).items()}
    auth = headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    if headers.get("x-bharosa-key"):
        return headers["x-bharosa-key"].strip()
    req = ctx.request_context.request
    qp = getattr(req, "query_params", None)
    return qp.get("key") if qp is not None else None


def _auth(svc: BharosaService, ctx: Context, role: str) -> str:
    found = svc.resolve_key(_key(ctx))
    if not found or found[1] != role:
        raise PermissionError("Bharosa: missing or invalid key for this endpoint")
    return found[0].id


def build_parent_mcp(svc: BharosaService) -> MCPServer:
    mcp = MCPServer("bharosa-parent", instructions=PARENT_INSTRUCTIONS, version="0.1.0")

    @mcp.tool()
    def get_my_profile(ctx: Context) -> dict[str, Any]:
        """Get the parent's name, language, guardian, usual medicines, known bills and pharmacy.
        Call this at the start of every conversation before doing anything else."""
        return svc.get_profile(_auth(svc, ctx, "parent"))

    @mcp.tool()
    def reorder_medicine(medicine: str, parent_said: str, ctx: Context, quantity: int | None = None) -> dict[str, Any]:
        """Reorder one of the parent's usual medicines from their regular pharmacy.
        `medicine`: the medicine name or what it is for, as the parent said it (e.g. "BP tablet").
        `parent_said`: the parent's exact words. `quantity`: only if the parent named a number.
        Bharosa checks the family's limits and either orders, or asks the guardian first."""
        return svc.reorder_medicine(_auth(svc, ctx, "parent"), medicine, quantity, parent_said)

    @mcp.tool()
    def check_bill(bill: str, ctx: Context) -> dict[str, Any]:
        """Look up the current amount and due date of one of the parent's known bills
        (electricity, water, gas, phone, internet, property tax). Read-only, nothing is paid."""
        return svc.check_bill(_auth(svc, ctx, "parent"), bill)

    @mcp.tool()
    def pay_bill(bill: str, parent_said: str, ctx: Context, biller_id: str | None = None,
                 consumer_number: str | None = None) -> dict[str, Any]:
        """Pay one of the parent's known bills, only after they clearly asked to pay it.
        `bill`: which bill, in the parent's words. `parent_said`: their exact words.
        Only fill `biller_id` and `consumer_number` if the parent reads out a bill that is NOT
        one of their known bills - that always needs the guardian's approval."""
        return svc.pay_bill(_auth(svc, ctx, "parent"), bill, parent_said, biller_id, consumer_number)

    @mcp.tool()
    def report_suspicious_call(what_happened: str, ctx: Context) -> dict[str, Any]:
        """Call this IMMEDIATELY when the parent mentions any call, SMS or person asking for money,
        an OTP/PIN, installing an app, or threatening arrest, a court case or disconnection.
        `what_happened`: the parent's words. Bharosa assesses the risk, alerts the guardian,
        locks spending if needed, and returns calm advice to read to the parent."""
        return svc.report_suspicious(_auth(svc, ctx, "parent"), what_happened)

    @mcp.tool()
    def message_family(message: str, ctx: Context) -> dict[str, Any]:
        """Send a short message from the parent to their guardian (e.g. "please call me tonight")."""
        return svc.message_family(_auth(svc, ctx, "parent"), message)

    @mcp.tool()
    def check_request_status(ctx: Context, request_id: str | None = None) -> dict[str, Any]:
        """Check what happened to an earlier request (e.g. "did Ravi approve it?").
        Leave `request_id` empty to get the most recent requests."""
        return svc.request_status(_auth(svc, ctx, "parent"), request_id)

    return mcp


def build_guardian_mcp(svc: BharosaService) -> MCPServer:
    mcp = MCPServer("bharosa-guardian", instructions=GUARDIAN_INSTRUCTIONS, version="0.1.0")

    @mcp.tool()
    def get_recent_activity(ctx: Context, limit: int = 20) -> dict[str, Any]:
        """What has the parent asked Bharosa to do recently, and what happened? Newest first."""
        st = svc.dashboard_state(_auth(svc, ctx, "guardian"))
        return {"parent": st["household"]["parent_name"],
                "events": [{"when": e["ts"], "what": e["summary"], "severity": e["severity"]}
                           for e in st["events"][:max(1, min(limit, 60))]]}

    @mcp.tool()
    def list_pending_approvals(ctx: Context) -> dict[str, Any]:
        """Requests waiting for the guardian. Approve them on the Bharosa dashboard, not here."""
        st = svc.dashboard_state(_auth(svc, ctx, "guardian"))
        return {"pending": [{"id": a["id"], "what": a["title"], "amount": a["amount"],
                             "why_asking": (a.get("decision") or {}).get("reasons", []),
                             "parent_said": a["parent_said"]} for a in st["pending"]],
                "approve_at": f"{svc.base_url}/g"}

    @mcp.tool()
    def get_limits(ctx: Context) -> dict[str, Any]:
        """Current spending limits, month-to-date auto-approved spend, and any freeze or scam lock."""
        st = svc.dashboard_state(_auth(svc, ctx, "guardian"))
        return {"policy": st["policy"], "spent_this_month": st["spent_this_month"],
                "scam_lock_minutes_left": st["scam_lock_minutes_left"]}

    return mcp
