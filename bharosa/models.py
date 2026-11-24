"""Domain models for Bharosa.

Everything the system stores is one of these pydantic models, serialised as JSON.
That keeps the SQLite and DynamoDB stores trivially interchangeable.
"""
from __future__ import annotations

import os
import time
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


def now() -> float:
    return time.time()


def new_id(prefix: str) -> str:
    """Time-sortable id: <prefix>_<ms timestamp base36><random>. Sorts by creation time."""
    ms = int(time.time() * 1000)
    ts = _b36(ms).rjust(9, "0")
    rnd = _b36(int.from_bytes(os.urandom(5), "big")).rjust(8, "0")
    return f"{prefix}_{ts}{rnd}"


def _b36(n: int) -> str:
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = chars[r] + out
    return out or "0"


Language = Literal["kn", "hi", "en"]


class Medicine(BaseModel):
    id: str
    name: str                      # e.g. "Telmisartan 40mg"
    purpose: str = ""              # e.g. "BP"
    aliases: list[str] = []        # words the parent may use: "BP maatre", "ಬಿಪಿ ಮಾತ್ರೆ"
    qty_per_order: int = 30
    unit_price: int = 5            # rupees, used for the pre-order estimate


class Pharmacy(BaseModel):
    name: str = "Neighbourhood Pharmacy"
    phone: str = ""
    address_note: str = ""         # how the pharmacy knows where to deliver


class Payee(BaseModel):
    id: str
    name: str                      # "BESCOM electricity"
    biller_id: str                 # sandbox BBPS biller id, e.g. "BESCOM"
    consumer_number: str
    category: str = "utility"
    aliases: list[str] = []        # "current bill", "ಕರೆಂಟ್ ಬಿಲ್", "बिजली"


class Guardian(BaseModel):
    name: str
    relation: str = "son"
    phone: str = ""                # E.164, used for SNS SMS if enabled
    ntfy_topic: str = ""           # free push notifications via ntfy.sh app


class Policy(BaseModel):
    auto_spend_limit: int = 500        # a single spend at or below this runs without asking
    monthly_auto_budget: int = 3000    # total auto-approved spend per calendar month
    hard_cap: int = 10000              # anything above is refused outright
    approval_ttl_minutes: int = 60     # pending approvals expire after this
    scam_lock_minutes: int = 120       # spending frozen this long after a scam signal
    frozen: bool = False               # guardian's manual "pause all spending"
    scam_locked_until: float | None = None


class Household(BaseModel):
    id: str
    parent_name: str
    parent_language: Language = "kn"
    parent_phone: str = ""
    guardian: Guardian
    pharmacy: Pharmacy = Pharmacy()
    medicines: list[Medicine] = []
    payees: list[Payee] = []
    policy: Policy = Policy()
    created_at: float = Field(default_factory=now)


class Tier(str, Enum):
    READ = "read"                  # look something up
    REVERSIBLE = "reversible"      # e.g. send a family message
    SPEND = "spend"                # moves money (or commits to)
    FORBIDDEN = "forbidden"        # never, whatever anyone says


class Outcome(str, Enum):
    ALLOW = "allow"
    ALLOW_NOTIFY = "allow_notify"
    REQUIRE_APPROVAL = "require_approval"
    DENY = "deny"


class Decision(BaseModel):
    outcome: Outcome
    tier: Tier
    reasons: list[str] = []
    triggers_scam_lock: bool = False


ActionKind = Literal["medicine_order", "bill_payment", "family_message", "scam_report"]
ActionStatus = Literal[
    "pending_approval", "awaiting_pharmacy", "completed", "denied", "blocked", "failed", "expired"
]


class Action(BaseModel):
    id: str
    household_id: str
    kind: ActionKind
    title: str                         # human summary for the guardian
    amount: int = 0
    target: str = ""                   # payee id / medicine id
    details: dict[str, Any] = {}
    parent_said: str = ""
    risk_score: float = 0.0
    risk_signals: list[str] = []
    decision: Decision | None = None
    status: ActionStatus = "pending_approval"
    approval_token_hash: str | None = None
    decided_by: str | None = None
    result: dict[str, Any] = {}
    created_at: float = Field(default_factory=now)
    updated_at: float = Field(default_factory=now)
    expires_at: float | None = None


Severity = Literal["info", "success", "warning", "urgent"]


class Event(BaseModel):
    id: str
    household_id: str
    ts: float = Field(default_factory=now)
    type: str                          # "tool_call", "approval_requested", "scam_alert", ...
    summary: str
    severity: Severity = "info"
    action_id: str | None = None
    data: dict[str, Any] = {}
