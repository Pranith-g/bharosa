from bharosa import intent


def test_medicine_reorder_is_auto_approved_and_guardian_informed(env):
    svc, hh = env["svc"], env["hh"]
    r = svc.reorder_medicine(hh.id, "ನನ್ನ BP ಮಾತ್ರೆ", None, "ನನ್ನ BP ಮಾತ್ರೆ ಮುಗಿಯುತ್ತಾ ಬಂತು")
    assert r["status"] == "completed"
    assert "Telmisartan" in r["say_to_parent"] and "₹180" in r["say_to_parent"]
    assert env["notifier"].sent[-1]["title"].startswith("FYI")


def test_unknown_medicine_asks_for_clarification(env):
    r = env["svc"].reorder_medicine(env["hh"].id, "vitamin gummies", None, "")
    assert r["status"] == "need_clarification" and "Telmisartan" in r["say_to_parent"]


def test_big_bill_waits_then_approve_executes_and_calls_parent(env):
    svc, hh = env["svc"], env["hh"]
    r = svc.pay_bill(hh.id, "ಕರೆಂಟ್ ಬಿಲ್", "ಕರೆಂಟ್ ಬಿಲ್ ಕಟ್ಟಬೇಕು")
    if r["status"] == "completed":           # sandbox amount can occasionally be under the limit
        return
    assert r["status"] == "waiting_for_guardian"
    note = env["notifier"].sent[-1]
    assert "/a/" in note["url"] and "?t=" in note["url"]
    done = svc.approve(hh.id, r["request_id"])
    assert done["status"] == "completed" and done["result"]["receipt"].startswith("BBPS-SBX-")
    assert env["voice"].calls and "Ravi" in env["voice"].calls[-1]
    # approving twice is refused
    assert not svc.approve(hh.id, r["request_id"])["ok"]


def test_gas_bill_approval_via_link_token(env):
    svc, hh = env["svc"], env["hh"]
    r = svc.pay_bill(hh.id, "gas", "pay the gas bill")       # Indane = ₹905 > ₹500 limit
    assert r["status"] == "waiting_for_guardian"
    url = env["notifier"].sent[-1]["url"]
    token = url.split("?t=")[1]
    assert not svc.decide_with_token(hh.id, r["request_id"], "wrong", True)["ok"]
    assert svc.decide_with_token(hh.id, r["request_id"], token, True)["status"] == "completed"
    # same link can't be reused
    assert not svc.decide_with_token(hh.id, r["request_id"], token, True)["ok"]


def test_deny_calls_parent_back(env):
    svc, hh = env["svc"], env["hh"]
    r = svc.pay_bill(hh.id, "gas", "pay gas")
    assert svc.deny(hh.id, r["request_id"])["status"] == "denied"
    assert "ಬೇಡ" in env["voice"].calls[-1]


def test_duplicate_requests_are_not_repeated(env):
    svc, hh = env["svc"], env["hh"]
    a = svc.pay_bill(hh.id, "gas", "pay gas")
    b = svc.pay_bill(hh.id, "gas", "pay gas")
    assert b["request_id"] == a["request_id"] and b["status"].startswith("duplicate_of")
    svc.approve(hh.id, a["request_id"])
    c = svc.pay_bill(hh.id, "gas", "pay gas again")
    assert c["status"] == "already_paid"


def test_scam_report_locks_spending_and_cancels_pending(env):
    svc, hh = env["svc"], env["hh"]
    pending = svc.pay_bill(hh.id, "gas", "pay gas")
    r = svc.report_suspicious(hh.id, "CBI ಇಂದ ಫೋನ್ ಬಂತು, ದುಡ್ಡು ಕಳಿಸಬೇಕಂತೆ")
    assert r["status"] == "scam_likely" and "1930" in r["say_to_parent"]
    assert env["notifier"].sent[-1]["urgent"]
    assert svc.store.get_action(hh.id, pending["request_id"]).status == "blocked"
    blocked = svc.reorder_medicine(hh.id, "BP", None, "BP tablets")
    assert blocked["status"] == "blocked"
    # guardian lifts lock -> works again
    svc.clear_scam_lock(hh.id)
    assert svc.reorder_medicine(hh.id, "sugar", None, "sugar tablets")["status"] == "completed"


def test_scam_lock_expires(env):
    svc, hh = env["svc"], env["hh"]
    svc.report_suspicious(hh.id, "someone asked for my OTP and said CBI will arrest me")
    env["clock"].advance(121 * 60)
    assert svc.reorder_medicine(hh.id, "BP", None, "BP")["status"] == "completed"


def test_scammy_payment_request_is_refused_outright(env):
    svc, hh = env["svc"], env["hh"]
    r = svc.pay_bill(hh.id, "electricity", "they said power will be cut tonight, pay now to this number")
    assert r["status"] == "blocked"
    assert svc.dashboard_state(hh.id)["scam_lock_minutes_left"] > 0


def test_new_payee_needs_approval(env):
    svc, hh = env["svc"], env["hh"]
    r = svc.pay_bill(hh.id, "someone's bill", "pay this one", biller_id="BWSSB", consumer_number="ZZ123456")
    assert r["status"] == "waiting_for_guardian"
    assert any("not on the approved list" in x for x in r["reasons"])


def test_freeze_blocks_even_approved(env):
    svc, hh = env["svc"], env["hh"]
    r = svc.pay_bill(hh.id, "gas", "pay gas")
    svc.update_policy(hh.id, {"frozen": True})
    assert svc.approve(hh.id, r["request_id"])["status"] == "blocked"
    assert svc.reorder_medicine(hh.id, "BP", None, "BP")["status"] == "blocked"


def test_pending_approval_expires(env):
    svc, hh = env["svc"], env["hh"]
    r = svc.pay_bill(hh.id, "gas", "pay gas")
    env["clock"].advance(61 * 60)
    st = svc.request_status(hh.id, r["request_id"])
    assert st["requests"][0]["status"] == "expired"
    assert not svc.approve(hh.id, r["request_id"])["ok"]


def test_monthly_budget_triggers_approval(env):
    svc, hh = env["svc"], env["hh"]
    svc.update_policy(hh.id, {"monthly_auto_budget": 300})
    assert svc.reorder_medicine(hh.id, "BP", None, "BP")["status"] == "completed"        # 180
    assert svc.reorder_medicine(hh.id, "sugar", None, "sugar")["status"] == "waiting_for_guardian"  # +180 > 300


def test_family_message(env):
    r = env["svc"].message_family(env["hh"].id, "Please call me tonight")
    assert r["status"] == "completed"
    assert env["notifier"].sent[-1]["body"] == "Please call me tonight"


def test_pharmacy_webhook_flow(env):
    """ElevenLabs pharmacy channel: order waits on the call, webhook completes it, parent is called."""
    svc, hh = env["svc"], env["hh"]

    class CallingPharmacy:
        name = "test-call"
        def place_order(self, hh, action):
            return {"status": "calling", "conversation_id": "conv_1"}

    svc.pharmacy = CallingPharmacy()
    r = svc.reorder_medicine(hh.id, "BP", None, "BP")
    assert r["status"] == "awaiting_pharmacy"
    res = svc.handle_pharmacy_result(hh.id, r["request_id"], True, 175, "6 pm")
    assert res["status"] == "completed"
    assert "₹175" in env["voice"].calls[-1]


def test_intent_router_all_languages(env):
    svc, hh = env["svc"], env["hh"]
    assert intent.handle(svc, hh, "ನನ್ನ BP ಮಾತ್ರೆ ಮುಗಿಯುತ್ತಾ ಬಂತು")["tool"] == "reorder_medicine"
    assert intent.handle(svc, hh, "बिजली का बिल कितना है?")["tool"] == "check_bill"
    assert intent.handle(svc, hh, "Please pay the water bill")["tool"] == "pay_bill"
    assert intent.handle(svc, hh, "Tell Ravi to call me tonight")["tool"] == "message_family"
    assert intent.handle(svc, hh, "ಏನಾಯ್ತು?")["tool"] == "check_request_status"
    assert intent.handle(svc, hh, "CBI ಇಂದ ಫೋನ್ ಬಂತು, ದುಡ್ಡು ಕಳಿಸಬೇಕಂತೆ")["tool"] == "report_suspicious_call"
