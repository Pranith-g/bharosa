"""The mandate engine: a deterministic, explainable decision for every tool call.

No LLM is involved here on purpose. The voice agent can be talked into anything;
this function cannot. It only sees structured facts (tier, amount, payee status,
scam risk, spend so far) and returns allow / allow_notify / require_approval / deny
with human-readable reasons that are shown to the guardian.
"""
from __future__ import annotations

from dataclasses import dataclass

from .models import Decision, Outcome, Policy, Tier

SCAM_DENY_THRESHOLD = 0.7      # this risky -> refuse and lock spending
SCAM_REVIEW_THRESHOLD = 0.35   # this risky -> a human must look at it


@dataclass
class ActionRequest:
    tier: Tier
    amount: int = 0
    known_payee: bool = True        # payee / pharmacy is on the guardian's list
    risk_score: float = 0.0
    description: str = ""


def evaluate(policy: Policy, req: ActionRequest, spent_this_month: int, now: float) -> Decision:
    reasons: list[str] = []

    if req.tier == Tier.FORBIDDEN:
        return Decision(outcome=Outcome.DENY, tier=req.tier,
                        reasons=["This kind of action is never allowed (e.g. sharing an OTP)."])

    if req.tier == Tier.READ:
        return Decision(outcome=Outcome.ALLOW, tier=req.tier, reasons=["Read-only."])

    if req.tier == Tier.REVERSIBLE:
        if req.risk_score >= SCAM_DENY_THRESHOLD:
            return Decision(outcome=Outcome.DENY, tier=req.tier, triggers_scam_lock=True,
                            reasons=[f"Scam risk {req.risk_score:.2f} is too high."])
        return Decision(outcome=Outcome.ALLOW_NOTIFY, tier=req.tier,
                        reasons=["Low-risk action; guardian is informed."])

    # --- SPEND ---------------------------------------------------------------
    if req.risk_score >= SCAM_DENY_THRESHOLD:
        return Decision(outcome=Outcome.DENY, tier=req.tier, triggers_scam_lock=True,
                        reasons=[f"Request looks like a scam (risk {req.risk_score:.2f}). "
                                 f"Spending locked for safety."])
    if policy.frozen:
        return Decision(outcome=Outcome.DENY, tier=req.tier,
                        reasons=["Guardian has paused all spending."])
    if policy.scam_locked_until and policy.scam_locked_until > now:
        mins = int((policy.scam_locked_until - now) // 60) + 1
        return Decision(outcome=Outcome.DENY, tier=req.tier,
                        reasons=[f"Spending is locked for {mins} more min after a scam warning."])
    if req.amount > policy.hard_cap:
        return Decision(outcome=Outcome.DENY, tier=req.tier,
                        reasons=[f"₹{req.amount} is above the hard cap of ₹{policy.hard_cap}."])

    needs_human = False
    if req.risk_score >= SCAM_REVIEW_THRESHOLD:
        needs_human = True
        reasons.append(f"Some scam signals (risk {req.risk_score:.2f}).")
    if not req.known_payee:
        needs_human = True
        reasons.append("Payee is not on the approved list.")
    if req.amount > policy.auto_spend_limit:
        needs_human = True
        reasons.append(f"₹{req.amount} is above the auto-approve limit of ₹{policy.auto_spend_limit}.")
    if spent_this_month + req.amount > policy.monthly_auto_budget:
        needs_human = True
        reasons.append(f"Would exceed this month's auto budget "
                       f"(₹{spent_this_month} spent of ₹{policy.monthly_auto_budget}).")

    if needs_human:
        return Decision(outcome=Outcome.REQUIRE_APPROVAL, tier=req.tier, reasons=reasons)
    return Decision(outcome=Outcome.ALLOW_NOTIFY, tier=req.tier,
                    reasons=[f"Known payee, ₹{req.amount} within limits."])
