import time

import pytest

from bharosa.models import Outcome, Policy, Tier
from bharosa.policy import ActionRequest, evaluate
from bharosa.scam import assess

NOW = time.time()


def ev(amount=100, known=True, risk=0.0, spent=0, **pol):
    return evaluate(Policy(**pol), ActionRequest(tier=Tier.SPEND, amount=amount, known_payee=known,
                                                 risk_score=risk), spent, NOW)


def test_small_known_spend_is_auto():
    assert ev(180).outcome == Outcome.ALLOW_NOTIFY


def test_above_limit_needs_approval():
    d = ev(2392)
    assert d.outcome == Outcome.REQUIRE_APPROVAL
    assert any("auto-approve limit" in r for r in d.reasons)


def test_new_payee_always_needs_approval_even_if_small():
    assert ev(50, known=False).outcome == Outcome.REQUIRE_APPROVAL


def test_monthly_budget():
    assert ev(400, spent=2800).outcome == Outcome.REQUIRE_APPROVAL


def test_hard_cap_denies():
    assert ev(20000).outcome == Outcome.DENY


def test_frozen_denies():
    assert ev(10, frozen=True).outcome == Outcome.DENY


def test_scam_lock_denies():
    assert ev(10, scam_locked_until=NOW + 600).outcome == Outcome.DENY


def test_high_risk_denies_and_locks():
    d = ev(10, risk=0.9)
    assert d.outcome == Outcome.DENY and d.triggers_scam_lock


def test_medium_risk_needs_human():
    assert ev(10, risk=0.4).outcome == Outcome.REQUIRE_APPROVAL


def test_forbidden_and_read():
    p = Policy()
    assert evaluate(p, ActionRequest(tier=Tier.FORBIDDEN), 0, NOW).outcome == Outcome.DENY
    assert evaluate(p, ActionRequest(tier=Tier.READ), 0, NOW).outcome == Outcome.ALLOW


@pytest.mark.parametrize("text,category", [
    ("CBI ಇಂದ ಫೋನ್ ಬಂತು, ದುಡ್ಡು ಕಳಿಸಬೇಕಂತೆ", "official_money_demand"),
    ("किसी ने फोन किया, बोले CBI से हैं, गिरफ्तार कर लेंगे, पैसे भेजो", "digital_arrest"),
    ("Someone called from CBI saying I will be arrested unless I transfer money", "digital_arrest"),
    ("The bank man asked for the OTP that just came", "credential_theft"),
    ("They said install AnyDesk so they can fix my KYC", "remote_access"),
    ("SMS says power will be cut tonight, pay now to this number", "fake_disconnection"),
])
def test_scams_are_high_risk(text, category):
    a = assess(text, use_llm=False)
    assert a.score >= 0.7, (text, a)
    assert a.category == category


@pytest.mark.parametrize("text", [
    "ನನ್ನ BP ಮಾತ್ರೆ ಮುಗಿಯುತ್ತಾ ಬಂತು", "ಕರೆಂಟ್ ಬಿಲ್ ಕಟ್ಟಬೇಕು", "बिजली का बिल भर दो",
    "Please pay the electricity bill", "Tell Ravi to call me tonight", "",
])
def test_normal_requests_are_low_risk(text):
    assert assess(text, use_llm=False).score < 0.35
