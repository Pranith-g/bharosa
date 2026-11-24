"""Bharosa core service.

Every action a voice agent asks for flows through `_submit`:

    request -> scam assessment -> policy decision -> execute | ask guardian | refuse
                                                         |            |
                                                      receipt    approval link -> approve -> execute -> call parent back

The MCP servers, the HTTP API and the simulator are thin shells around this class.
"""
from __future__ import annotations

import difflib
import hashlib
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from . import messages
from .billing import BillingError, SandboxBBPS
from .channels import FanOutNotifier, Notifier, ParentVoice, PharmacyChannel, SimulatedPharmacy, SimulatedVoice
from .models import (Action, Decision, Event, Guardian, Household, Medicine, Outcome, Payee, Pharmacy, Policy,
                     Tier, new_id)
from .policy import SCAM_REVIEW_THRESHOLD, ActionRequest, evaluate
from .scam import CATEGORY_LABELS, assess
from .store import Store

log = logging.getLogger(__name__)
IST = timezone(timedelta(hours=5, minutes=30))

CATEGORY_WORDS = {
    "electricity": ["electricity", "current", "power", "light bill", "bijli", "ಕರೆಂಟ್", "ವಿದ್ಯುತ್", "ಲೈಟ್", "बिजली", "लाइट"],
    "water": ["water", "ನೀರು", "ನೀರಿನ", "पानी"],
    "gas": ["gas", "cylinder", "ಗ್ಯಾಸ್", "ಸಿಲಿಂಡರ್", "गैस", "सिलेंडर"],
    "mobile": ["mobile", "phone bill", "recharge", "ಮೊಬೈಲ್", "ರೀಚಾರ್ಜ್", "मोबाइल", "रिचार्ज"],
    "broadband": ["internet", "wifi", "wi-fi", "broadband", "ಇಂಟರ್ನೆಟ್", "इंटरनेट"],
    "tax": ["tax", "property tax", "ತೆರಿಗೆ", "टैक्स", "कर"],
}
SPEND_KINDS = {"medicine_order", "bill_payment"}


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _norm(s: str) -> str:
    return " ".join((s or "").lower().replace("-", " ").split())


class BharosaService:
    def __init__(self, store: Store, notifier: Notifier | None = None, voice: ParentVoice | None = None,
                 pharmacy: PharmacyChannel | None = None, billing: SandboxBBPS | None = None,
                 base_url: str = "http://localhost:8000", clock: Callable[[], float] = time.time):
        self.store = store
        self.notifier = notifier or FanOutNotifier([])
        self.voice = voice or SimulatedVoice()
        self.pharmacy = pharmacy or SimulatedPharmacy()
        self.billing = billing or SandboxBBPS()
        self.base_url = base_url.rstrip("/")
        self.clock = clock

    # ================================================================ households & keys
    def create_household(self, parent_name: str, guardian: Guardian, language: str = "kn",
                         parent_phone: str = "", pharmacy: Pharmacy | None = None,
                         medicines: list[Medicine] | None = None, payees: list[Payee] | None = None,
                         policy: Policy | None = None) -> tuple[Household, str, str]:
        hh = Household(id=new_id("hh"), parent_name=parent_name, parent_language=language,  # type: ignore[arg-type]
                       parent_phone=parent_phone, guardian=guardian, pharmacy=pharmacy or Pharmacy(),
                       medicines=medicines or [], payees=payees or [], policy=policy or Policy())
        self.store.put_household(hh)
        parent_key = self.issue_key(hh.id, "parent")
        guardian_key = self.issue_key(hh.id, "guardian")
        self._event(hh.id, "household_created", f"Bharosa set up for {parent_name}", "success")
        return hh, parent_key, guardian_key

    def issue_key(self, household_id: str, role: str) -> str:
        key = ("bp_" if role == "parent" else "bg_") + secrets.token_urlsafe(24)
        self.store.put_token(_hash(key), household_id, role)
        return key

    def resolve_key(self, key: str | None) -> tuple[Household, str] | None:
        if not key:
            return None
        found = self.store.resolve_token(_hash(key.strip()))
        if not found:
            return None
        hh = self.store.get_household(found[0])
        return (hh, found[1]) if hh else None

    def links(self, parent_key: str, guardian_key: str) -> dict[str, str]:
        return {
            "parent_mcp_url": f"{self.base_url}/mcp?key={parent_key}",
            "guardian_mcp_url": f"{self.base_url}/guardian-mcp?key={guardian_key}",
            "guardian_dashboard": f"{self.base_url}/g#{guardian_key}",
            "parent_simulator": f"{self.base_url}/p#{parent_key}",
        }

    # ================================================================ parent-facing tools
    def get_profile(self, hh_id: str) -> dict:
        hh = self._hh(hh_id)
        return {
            "ok": True,
            "parent_name": hh.parent_name,
            "language": hh.parent_language,
            "guardian": f"{hh.guardian.name} ({hh.guardian.relation})",
            "pharmacy": hh.pharmacy.name,
            "medicines": [{"name": m.name, "for": m.purpose, "usual_quantity": m.qty_per_order}
                          for m in hh.medicines],
            "bills": [{"name": p.name, "category": p.category} for p in hh.payees],
            "spending_paused": hh.policy.frozen or self._scam_locked(hh),
        }

    def reorder_medicine(self, hh_id: str, medicine: str, quantity: int | None = None,
                         parent_said: str = "") -> dict:
        hh = self._hh(hh_id)
        lang, g = hh.parent_language, hh.guardian.name
        med = self._match_medicine(hh, medicine)
        if not med:
            opts = ", ".join(f"{m.name} ({m.purpose})" if m.purpose else m.name for m in hh.medicines) or "-"
            self._event(hh.id, "tool_call", f"Couldn't match medicine '{medicine}'")
            return {"ok": False, "status": "need_clarification",
                    "say_to_parent": messages.say("not_found_medicine", lang, options=opts)}
        qty = max(1, min(int(quantity or med.qty_per_order), 200))
        amount = qty * med.unit_price
        title = f"Order {qty} × {med.name} from {hh.pharmacy.name} (≈₹{amount})"
        dup = self._recent_duplicate(hh, "medicine_order", med.id, minutes=30)
        if dup:
            return self._dup_response(hh, dup)
        action = Action(id=new_id("act"), household_id=hh.id, kind="medicine_order", title=title,
                        amount=amount, target=med.id, parent_said=parent_said,
                        details={"medicine_name": med.name, "quantity": qty, "pharmacy": hh.pharmacy.name})
        return self._submit(hh, action, ActionRequest(tier=Tier.SPEND, amount=amount, known_payee=True))

    def check_bill(self, hh_id: str, payee: str) -> dict:
        hh = self._hh(hh_id)
        p = self._match_payee(hh, payee)
        if not p:
            return self._payee_not_found(hh, payee)
        try:
            bill = self.billing.fetch_bill(p.biller_id, p.consumer_number)
        except BillingError as exc:
            return {"ok": False, "status": "error", "error": str(exc)}
        self._event(hh.id, "tool_call", f"{hh.parent_name} checked the {p.name} bill: ₹{bill['amount']}")
        return {"ok": True, "status": "bill_found", "bill": bill,
                "say_to_parent": messages.say("bill_info", hh.parent_language, biller=p.name,
                                              amount=bill["amount"], due=bill["due_date"])}

    def pay_bill(self, hh_id: str, payee: str, parent_said: str = "",
                 biller_id: str | None = None, consumer_number: str | None = None) -> dict:
        hh = self._hh(hh_id)
        p = self._match_payee(hh, payee) if not (biller_id and consumer_number) else \
            next((x for x in hh.payees if x.biller_id == biller_id and x.consumer_number == consumer_number), None)
        known = p is not None
        if not p:
            if not (biller_id and consumer_number):
                return self._payee_not_found(hh, payee)
            p = Payee(id=f"new:{biller_id}:{consumer_number}", name=f"{biller_id} {consumer_number}",
                      biller_id=biller_id, consumer_number=consumer_number, category="unknown")
        try:
            bill = self.billing.fetch_bill(p.biller_id, p.consumer_number)
        except BillingError as exc:
            return {"ok": False, "status": "error", "error": str(exc)}

        paid = self._recent_duplicate(hh, "bill_payment", p.id, minutes=60 * 24 * 20, statuses={"completed"})
        if paid and paid.details.get("bill_period") == bill["bill_period"]:
            return {"ok": True, "status": "already_paid", "request_id": paid.id,
                    "say_to_parent": messages.say("already_paid", hh.parent_language, biller=p.name,
                                                  receipt=paid.result.get("receipt", "-"))}
        dup = self._recent_duplicate(hh, "bill_payment", p.id, minutes=60)
        if dup:
            return self._dup_response(hh, dup)

        amount = bill["amount"]
        action = Action(id=new_id("act"), household_id=hh.id, kind="bill_payment",
                        title=f"Pay {p.name} bill ₹{amount}" + ("" if known else " (NEW payee)"),
                        amount=amount, target=p.id, parent_said=parent_said,
                        details={"biller_id": p.biller_id, "consumer_number": p.consumer_number,
                                 "payee_name": p.name, "bill_period": bill["bill_period"],
                                 "due_date": bill["due_date"], "known_payee": known})
        return self._submit(hh, action, ActionRequest(tier=Tier.SPEND, amount=amount, known_payee=known))

    def report_suspicious(self, hh_id: str, what_happened: str) -> dict:
        hh = self._hh(hh_id)
        a = assess(what_happened)
        lang, g = hh.parent_language, hh.guardian.name
        action = Action(id=new_id("act"), household_id=hh.id, kind="scam_report",
                        title=f"Possible scam reported: {CATEGORY_LABELS.get(a.category, a.category)}", parent_said=what_happened,
                        risk_score=a.score, risk_signals=a.signals, status="completed",
                        decision=Decision(outcome=Outcome.ALLOW, tier=Tier.READ, reasons=a.signals))
        self.store.put_action(action)
        if a.is_high:
            self._apply_scam_lock(hh, action, f"{hh.parent_name} described a likely "
                                 f"{CATEGORY_LABELS.get(a.category, 'scam')}")
            say = messages.safe_script(lang, g)
            status = "scam_likely"
        elif a.score >= SCAM_REVIEW_THRESHOLD:
            self._event(hh.id, "scam_warning", f"Suspicious call reported (risk {a.score:.2f}): "
                        f"“{what_happened[:120]}”", "warning", action.id, {"signals": a.signals})
            self.notifier.send(hh, f"Check on {hh.parent_name}",
                               f"{hh.parent_name} reported a suspicious call: “{what_happened[:200]}”",
                               self._dash_url(), urgent=False)
            say = messages.safe_script(lang, g)
            status = "suspicious"
        else:
            self._event(hh.id, "tool_call", f"{hh.parent_name} mentioned a call (no scam signals)",
                        action_id=action.id)
            say = messages.say("gentle_safety", lang)
            status = "low_risk"
        return {"ok": True, "status": status, "risk_score": a.score, "category": a.category,
                "signals": a.signals, "say_to_parent": say,
                "agent_note": "Read say_to_parent calmly and slowly. Do not ask for any numbers or codes."}

    def message_family(self, hh_id: str, message: str) -> dict:
        hh = self._hh(hh_id)
        a = assess(message)
        action = Action(id=new_id("act"), household_id=hh.id, kind="family_message",
                        title=f"Message to {hh.guardian.name}", parent_said=message,
                        details={"message": message}, risk_score=a.score, risk_signals=a.signals)
        return self._submit(hh, action, ActionRequest(tier=Tier.REVERSIBLE, risk_score=a.score))

    def request_status(self, hh_id: str, request_id: str | None = None) -> dict:
        hh = self._hh(hh_id)
        self._expire_stale(hh)
        if request_id:
            act = self.store.get_action(hh.id, request_id)
            acts = [act] if act else []
        else:
            acts = [x for x in self.store.list_actions(hh.id, 10) if x.kind in SPEND_KINDS][:3]
        if not acts:
            return {"ok": False, "status": "not_found"}
        out = []
        for act in acts:
            out.append({"request_id": act.id, "what": act.title, "status": act.status,
                        "say_to_parent": self._status_line(hh, act)})
        return {"ok": True, "requests": out, "say_to_parent": out[0]["say_to_parent"]}

    # ================================================================ guardian operations
    def approve(self, hh_id: str, action_id: str, by: str = "guardian") -> dict:
        return self._decide(hh_id, action_id, approve=True, by=by)

    def deny(self, hh_id: str, action_id: str, by: str = "guardian") -> dict:
        return self._decide(hh_id, action_id, approve=False, by=by)

    def decide_with_token(self, hh_id: str, action_id: str, token: str, approve: bool) -> dict:
        act = self.store.get_action(hh_id, action_id)
        if not act or not act.approval_token_hash or not secrets.compare_digest(act.approval_token_hash,
                                                                                 _hash(token or "")):
            return {"ok": False, "error": "invalid or expired link"}
        return self._decide(hh_id, action_id, approve=approve, by="guardian (link)")

    def update_policy(self, hh_id: str, patch: dict[str, Any]) -> Policy:
        hh = self._hh(hh_id)
        allowed = {"auto_spend_limit", "monthly_auto_budget", "hard_cap", "approval_ttl_minutes",
                   "scam_lock_minutes", "frozen"}
        data = hh.policy.model_dump()
        for k, v in patch.items():
            if k in allowed:
                data[k] = v
        hh.policy = Policy.model_validate(data)
        self.store.put_household(hh)
        self._event(hh.id, "policy_changed", "Guardian updated limits: " +
                    ", ".join(f"{k}={v}" for k, v in patch.items() if k in allowed))
        return hh.policy

    def clear_scam_lock(self, hh_id: str) -> None:
        hh = self._hh(hh_id)
        hh.policy.scam_locked_until = None
        self.store.put_household(hh)
        self._event(hh.id, "policy_changed", "Guardian lifted the scam lock", "success")

    def update_profile(self, hh_id: str, patch: dict[str, Any]) -> Household:
        hh = self._hh(hh_id)
        data = hh.model_dump()
        for k in ("parent_name", "parent_language", "parent_phone", "guardian", "pharmacy", "medicines", "payees"):
            if k in patch:
                data[k] = patch[k]
        hh = Household.model_validate(data)
        self.store.put_household(hh)
        self._event(hh.id, "profile_changed", "Guardian updated the profile")
        return hh

    def dashboard_state(self, hh_id: str) -> dict:
        hh = self._hh(hh_id)
        self._expire_stale(hh)
        hh = self._hh(hh_id)
        actions = self.store.list_actions(hh.id, 100)
        now = self.clock()
        return {
            "household": hh.model_dump(exclude={"policy"}),
            "policy": hh.policy.model_dump(),
            "spent_this_month": self._spent_this_month(hh, actions),
            "scam_lock_minutes_left": max(0, int(((hh.policy.scam_locked_until or 0) - now) // 60) + 1)
            if self._scam_locked(hh) else 0,
            "pending": [a.model_dump(exclude={"approval_token_hash"}) for a in actions
                        if a.status == "pending_approval"],
            "recent": [a.model_dump(exclude={"approval_token_hash"}) for a in actions[:25]],
            "events": [e.model_dump() for e in self.store.list_events(hh.id, 60)],
        }

    def handle_pharmacy_result(self, hh_id: str, action_id: str, available: bool,
                               price: int | None = None, eta: str | None = None, note: str = "") -> dict:
        hh = self._hh(hh_id)
        act = self.store.get_action(hh.id, action_id)
        if not act or act.status != "awaiting_pharmacy":
            return {"ok": False, "error": "no order waiting for this result"}
        med = act.details.get("medicine_name", "")
        lang = hh.parent_language
        if available:
            act.status = "completed"
            act.result = {"price": price or act.amount, "eta": eta or "today", "note": note}
            if price:
                act.amount = int(price)
            msg = messages.say("order_placed", lang, pharmacy=hh.pharmacy.name, medicine=med,
                               amount=act.amount, eta=act.result["eta"])
            self._event(hh.id, "action_completed", f"Pharmacy confirmed: {act.title}", "success", act.id)
        else:
            act.status = "failed"
            act.result = {"note": note or "not available"}
            msg = messages.say("pharmacy_unavailable", lang, pharmacy=hh.pharmacy.name, medicine=med,
                               guardian=hh.guardian.name)
            self._event(hh.id, "action_failed", f"Pharmacy couldn't fulfil: {act.title}", "warning", act.id)
            self.notifier.send(hh, "Pharmacy couldn't fulfil order", f"{act.title}: {note}", self._dash_url())
        act.updated_at = self.clock()
        self.store.put_action(act)
        self._callback(hh, messages.say("callback_order", lang, parent=hh.parent_name, result=msg), act)
        return {"ok": True, "status": act.status}

    # ================================================================ internals
    def _submit(self, hh: Household, action: Action, req: ActionRequest) -> dict:
        lang, g = hh.parent_language, hh.guardian.name
        if action.parent_said and not action.risk_signals:
            a = assess(action.parent_said)
            action.risk_score, action.risk_signals = a.score, a.signals
        req.risk_score = max(req.risk_score, action.risk_score)
        actions = self.store.list_actions(hh.id, 200)
        decision = evaluate(hh.policy, req, self._spent_this_month(hh, actions), self.clock())
        action.decision = decision

        if decision.outcome == Outcome.DENY:
            action.status = "blocked"
            self.store.put_action(action)
            if decision.triggers_scam_lock:
                self._apply_scam_lock(hh, action, f"Blocked a risky request: {action.title}")
                say = messages.safe_script(lang, g)
            elif hh.policy.frozen:
                say = messages.say("denied_frozen", lang, guardian=g)
            elif self._scam_locked(hh):
                say = messages.say("denied_locked", lang, guardian=g)
            else:
                say = messages.say("denied_generic", lang, guardian=g)
            self._event(hh.id, "action_blocked", f"Blocked: {action.title}", "warning", action.id,
                        {"reasons": decision.reasons})
            if not decision.triggers_scam_lock:
                self.notifier.send(hh, f"Blocked for {hh.parent_name}",
                                   f"{action.title}\nWhy: {'; '.join(decision.reasons)}", self._dash_url())
            return {"ok": False, "status": "blocked", "request_id": action.id, "reasons": decision.reasons,
                    "say_to_parent": say}

        if decision.outcome == Outcome.REQUIRE_APPROVAL:
            token = secrets.token_urlsafe(18)
            action.approval_token_hash = _hash(token)
            action.status = "pending_approval"
            action.expires_at = self.clock() + hh.policy.approval_ttl_minutes * 60
            self.store.put_action(action)
            url = f"{self.base_url}/a/{hh.id}/{action.id}?t={token}"
            self._event(hh.id, "approval_requested", f"Needs your approval: {action.title}", "warning",
                        action.id, {"reasons": decision.reasons})
            self.notifier.send(hh, f"Approve for {hh.parent_name}? ₹{action.amount}" if action.amount
                               else f"Approve for {hh.parent_name}?",
                               f"{action.title}\nWhy asking: {'; '.join(decision.reasons)}"
                               + (f"\n{hh.parent_name} said: “{action.parent_said[:160]}”" if action.parent_said else ""),
                               url, urgent=action.risk_score >= SCAM_REVIEW_THRESHOLD)
            return {"ok": True, "status": "waiting_for_guardian", "request_id": action.id,
                    "reasons": decision.reasons,
                    "say_to_parent": messages.say("approval_sent", lang, guardian=g),
                    "agent_note": "Tell the parent and end the topic. You will call them back automatically."}

        # ALLOW / ALLOW_NOTIFY
        self.store.put_action(action)
        return self._execute(hh, action, after_approval=False)

    def _execute(self, hh: Household, action: Action, after_approval: bool) -> dict:
        lang, g = hh.parent_language, hh.guardian.name
        try:
            if action.kind == "bill_payment":
                d = action.details
                action.result = self.billing.pay(d["biller_id"], d["consumer_number"], action.amount)
                action.status = "completed"
                say = messages.say("bill_paid", lang, biller=d["payee_name"], amount=action.amount,
                                   receipt=action.result["receipt"])
            elif action.kind == "medicine_order":
                res = self.pharmacy.place_order(hh, action)
                action.result = res
                if res.get("status") == "calling":
                    action.status = "awaiting_pharmacy"
                    say = messages.say("order_calling", lang, pharmacy=hh.pharmacy.name)
                else:
                    action.status = "completed"
                    if res.get("price"):
                        action.amount = int(res["price"])
                    say = messages.say("order_placed", lang, pharmacy=hh.pharmacy.name,
                                       medicine=action.details["medicine_name"], amount=action.amount,
                                       eta=res.get("eta", "today"))
            elif action.kind == "family_message":
                self.notifier.send(hh, f"Message from {hh.parent_name}", action.details["message"],
                                   self._dash_url())
                action.status = "completed"
                say = messages.say("message_sent", lang, guardian=g)
            else:
                raise ValueError(f"cannot execute {action.kind}")
        except Exception as exc:
            log.exception("execution failed")
            action.status = "failed"
            action.result = {"error": str(exc)}
            action.updated_at = self.clock()
            self.store.put_action(action)
            self._event(hh.id, "action_failed", f"Failed: {action.title} ({exc})", "warning", action.id)
            self.notifier.send(hh, f"Something failed for {hh.parent_name}", f"{action.title}: {exc}",
                               self._dash_url())
            return {"ok": False, "status": "failed", "request_id": action.id,
                    "say_to_parent": messages.say("denied_generic", lang, guardian=g)}

        action.updated_at = self.clock()
        self.store.put_action(action)
        verb = "Done" if action.status == "completed" else "In progress"
        self._event(hh.id, "action_completed" if action.status == "completed" else "action_started",
                    f"{verb}: {action.title}" + (" (approved by you)" if after_approval else " (auto-approved)"),
                    "success", action.id, {"result": action.result})
        if not after_approval and action.kind in SPEND_KINDS and action.status == "completed":
            self.notifier.send(hh, f"FYI: {action.title}", "Auto-approved within your limits.", self._dash_url())
        if after_approval and action.status == "completed":
            self._callback(hh, messages.say("callback_approved", lang, parent=hh.parent_name, guardian=g,
                                            result=say), action)
        return {"ok": True, "status": action.status, "request_id": action.id, "result": action.result,
                "say_to_parent": say}

    def _decide(self, hh_id: str, action_id: str, approve: bool, by: str) -> dict:
        hh = self._hh(hh_id)
        self._expire_stale(hh)
        act = self.store.get_action(hh.id, action_id)
        if not act:
            return {"ok": False, "error": "not found"}
        if act.status != "pending_approval":
            return {"ok": False, "error": f"already {act.status}", "status": act.status}
        act.decided_by = by                     # link stays viewable; status change makes it single-use
        if not approve:
            act.status = "denied"
            act.updated_at = self.clock()
            self.store.put_action(act)
            self._event(hh.id, "approval_denied", f"You declined: {act.title}", "info", act.id)
            self._callback(hh, messages.say("callback_denied", hh.parent_language, parent=hh.parent_name,
                                            guardian=hh.guardian.name, title=act.title), act)
            return {"ok": True, "status": "denied"}
        # Re-check hard rules at approval time: a freeze or scam lock since the request still wins.
        if hh.policy.frozen or self._scam_locked(hh):
            act.status = "blocked"
            self.store.put_action(act)
            self._event(hh.id, "action_blocked", f"Not executed (spending paused): {act.title}", "warning", act.id)
            return {"ok": False, "status": "blocked", "error": "spending is paused or scam-locked"}
        self._event(hh.id, "approval_granted", f"You approved: {act.title}", "success", act.id)
        return self._execute(hh, act, after_approval=True)

    def _callback(self, hh: Household, message: str, act: Action) -> None:
        try:
            res = self.voice.call_parent(hh, message)
        except Exception as exc:
            log.warning("callback failed: %s", exc)
            res = {"status": "failed", "error": str(exc)}
        self._event(hh.id, "parent_callback", f"Called {hh.parent_name} back: “{message}”",
                    "info", act.id, {"voice": res})

    def _apply_scam_lock(self, hh: Household, action: Action, why: str) -> None:
        hh = self._hh(hh.id)
        hh.policy.scam_locked_until = self.clock() + hh.policy.scam_lock_minutes * 60
        self.store.put_household(hh)
        cancelled = 0
        for a in self.store.list_actions(hh.id, 50):
            if a.status == "pending_approval" and a.kind in SPEND_KINDS:
                a.status = "blocked"
                a.result = {"note": "cancelled by scam lock"}
                self.store.put_action(a)
                cancelled += 1
        self._event(hh.id, "scam_alert", f"⚠ {why}. Spending locked for {hh.policy.scam_lock_minutes} min"
                    + (f"; {cancelled} pending request(s) cancelled" if cancelled else "") + ".",
                    "urgent", action.id, {"signals": action.risk_signals, "said": action.parent_said})
        self.notifier.send(hh, f"⚠ Possible scam: call {hh.parent_name} now",
                           f"{why}.\nThey said: “{action.parent_said[:200]}”\n"
                           f"All spending is locked for {hh.policy.scam_lock_minutes} min.",
                           self._dash_url(), urgent=True)

    def _expire_stale(self, hh: Household) -> None:
        now = self.clock()
        for a in self.store.list_actions(hh.id, 50):
            if a.status == "pending_approval" and a.expires_at and a.expires_at < now:
                a.status = "expired"
                a.updated_at = now
                self.store.put_action(a)
                self._event(hh.id, "approval_expired", f"Expired without a reply: {a.title}", "info", a.id)

    def _status_line(self, hh: Household, act: Action) -> str:
        lang, g = hh.parent_language, hh.guardian.name
        if act.status == "pending_approval":
            return messages.say("status_pending", lang, guardian=g)
        if act.status == "denied":
            return messages.say("status_denied", lang, guardian=g)
        if act.status == "expired":
            return messages.say("status_expired", lang, guardian=g)
        if act.status == "awaiting_pharmacy":
            return messages.say("order_calling", lang, pharmacy=hh.pharmacy.name)
        if act.status == "completed" and act.kind == "bill_payment":
            return messages.say("bill_paid", lang, biller=act.details.get("payee_name", ""),
                                amount=act.amount, receipt=act.result.get("receipt", "-"))
        if act.status == "completed" and act.kind == "medicine_order":
            return messages.say("order_placed", lang, pharmacy=hh.pharmacy.name,
                                medicine=act.details.get("medicine_name", ""), amount=act.amount,
                                eta=act.result.get("eta", "today"))
        return messages.say("denied_generic", lang, guardian=g)

    def _recent_duplicate(self, hh: Household, kind: str, target: str, minutes: int,
                          statuses: set[str] | None = None) -> Action | None:
        statuses = statuses or {"pending_approval", "awaiting_pharmacy", "completed"}
        cutoff = self.clock() - minutes * 60
        for a in self.store.list_actions(hh.id, 100):
            if a.kind == kind and a.target == target and a.status in statuses and a.created_at >= cutoff:
                return a
        return None

    def _dup_response(self, hh: Household, dup: Action) -> dict:
        lang, g = hh.parent_language, hh.guardian.name
        if dup.status == "pending_approval":
            say = messages.say("already_pending", lang, guardian=g)
        else:
            say = self._status_line(hh, dup)
        return {"ok": True, "status": f"duplicate_of_{dup.status}", "request_id": dup.id, "say_to_parent": say,
                "agent_note": "This was already requested; nothing new was done."}

    def _payee_not_found(self, hh: Household, payee: str) -> dict:
        opts = ", ".join(p.name for p in hh.payees) or "-"
        self._event(hh.id, "tool_call", f"Couldn't match bill '{payee}'")
        return {"ok": False, "status": "need_clarification",
                "say_to_parent": messages.say("not_found_payee", hh.parent_language, options=opts)}

    def _match_medicine(self, hh: Household, q: str) -> Medicine | None:
        q = _norm(q)
        if not q:
            return None
        for m in hh.medicines:
            names = [_norm(m.name), _norm(m.purpose), _norm(m.id)] + [_norm(a) for a in m.aliases]
            if any(n and (n == q or n in q or q in n) for n in names):
                return m
        choices = {_norm(a): m for m in hh.medicines for a in [m.name, m.purpose, *m.aliases] if a}
        close = difflib.get_close_matches(q, list(choices), n=1, cutoff=0.6)
        return choices[close[0]] if close else None

    def _match_payee(self, hh: Household, q: str) -> Payee | None:
        q = _norm(q)
        if not q:
            return None
        for p in hh.payees:
            names = [_norm(p.name), _norm(p.biller_id), _norm(p.id)] + [_norm(a) for a in p.aliases]
            if any(n and (n == q or n in q or q in n) for n in names):
                return p
        for p in hh.payees:
            if any(_norm(w) in q for w in CATEGORY_WORDS.get(p.category, [])):
                return p
        choices = {_norm(a): p for p in hh.payees for a in [p.name, *p.aliases] if a}
        close = difflib.get_close_matches(q, list(choices), n=1, cutoff=0.6)
        return choices[close[0]] if close else None

    def _spent_this_month(self, hh: Household, actions: list[Action]) -> int:
        start = datetime.now(IST).replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()
        return sum(a.amount for a in actions
                   if a.kind in SPEND_KINDS and a.status in {"completed", "awaiting_pharmacy"}
                   and a.created_at >= start)

    def _scam_locked(self, hh: Household) -> bool:
        return bool(hh.policy.scam_locked_until and hh.policy.scam_locked_until > self.clock())

    def _hh(self, hh_id: str) -> Household:
        hh = self.store.get_household(hh_id)
        if not hh:
            raise KeyError(f"household {hh_id} not found")
        return hh

    def _dash_url(self) -> str:
        return f"{self.base_url}/g"

    def _event(self, hh_id: str, type_: str, summary: str, severity: str = "info",
               action_id: str | None = None, data: dict | None = None) -> None:
        self.store.add_event(Event(id=new_id("ev"), household_id=hh_id, ts=self.clock(), type=type_,
                                   summary=summary, severity=severity, action_id=action_id,  # type: ignore[arg-type]
                                   data=data or {}))
