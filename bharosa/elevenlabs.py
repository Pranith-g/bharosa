"""Thin ElevenLabs Agents client: outbound calls + post-call webhook verification.

Used for two things:
  * calling the pharmacy on the parent's behalf (a "pharmacy caller" agent), and
  * calling the parent back once the guardian has approved something.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Any

import httpx

from .config import settings

log = logging.getLogger(__name__)
API = "https://api.elevenlabs.io"


class ElevenLabsError(Exception):
    pass


def outbound_call(agent_id: str, to_number: str, dynamic_variables: dict[str, Any],
                  first_message: str | None = None) -> dict:
    s = settings()
    if not (s.elevenlabs_api_key and s.elevenlabs_phone_number_id):
        raise ElevenLabsError("ElevenLabs outbound calling is not configured")
    path = "/v1/convai/sip-trunk/outbound-call" if s.elevenlabs_telephony == "sip" \
        else "/v1/convai/twilio/outbound-call"
    init: dict[str, Any] = {"dynamic_variables": {k: str(v) for k, v in dynamic_variables.items()}}
    if first_message:
        init["conversation_config_override"] = {"agent": {"first_message": first_message}}
    body = {
        "agent_id": agent_id,
        "agent_phone_number_id": s.elevenlabs_phone_number_id,
        "to_number": to_number,
        "conversation_initiation_client_data": init,
    }
    r = httpx.post(API + path, json=body, headers={"xi-api-key": s.elevenlabs_api_key}, timeout=20)
    if r.status_code >= 300:
        raise ElevenLabsError(f"outbound call failed: {r.status_code} {r.text[:300]}")
    return r.json()


def verify_webhook(raw_body: bytes, signature_header: str | None, secret: str,
                   tolerance_s: int = 30 * 60) -> bool:
    """Verify `ElevenLabs-Signature: t=<unix>,v0=<hex hmac_sha256(secret, f"{t}.{body}")>`."""
    if not signature_header or not secret:
        return False
    parts = dict(p.split("=", 1) for p in signature_header.split(",") if "=" in p)
    t, v0 = parts.get("t"), parts.get("v0")
    if not t or not v0 or not t.isdigit():
        return False
    if abs(time.time() - int(t)) > tolerance_s:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v0)


def sign_webhook(raw_body: bytes, secret: str, t: int | None = None) -> str:
    """Produce a header value in ElevenLabs' format (used by tests and the local simulator)."""
    t = t or int(time.time())
    mac = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return f"t={t},v0={mac}"
