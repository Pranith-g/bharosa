"""Offline stand-in for the voice agent's brain, used by the browser "parent line" simulator.

In production the ElevenLabs agent (an LLM) chooses MCP tools. This keyword router
lets anyone test the whole system - policy, approvals, scam lock, callbacks - with no
API keys, and doubles as a demo fallback if the venue Wi-Fi dies.
It calls exactly the same service methods the MCP tools call.
"""
from __future__ import annotations

from .models import Household
from .scam import assess
from .service import CATEGORY_WORDS, BharosaService

MED_WORDS = ["medicine", "tablet", "tablets", "pills", "maatre", "ಮಾತ್ರೆ", "ಔಷಧ", "ಗುಳಿಗೆ", "दवा", "दवाई", "गोली"]
BILL_WORDS = ["bill", "ಬಿಲ್", "बिल"] + [w for ws in CATEGORY_WORDS.values() for w in ws]
PAY_WORDS = ["pay", "ಕಟ್ಟ", "ಪಾವತಿ", "भर", "जमा", "भुगतान", "kattu"]
STATUS_WORDS = ["status", "what happened", "approved", "ಏನಾಯ್ತು", "ಆಯ್ತಾ", "ಒಪ್ಪಿದ", "क्या हुआ", "मंज़ूरी", "मंजूरी"]
MESSAGE_WORDS = ["tell ", "message", "call me", "ಹೇಳಿ", "ಕಾಲ್ ಮಾಡಲು", "बता", "संदेश", "फोन करने"]

HELP = {
    "kn": "ನಾನು ಮಾತ್ರೆ ಆರ್ಡರ್ ಮಾಡಬಹುದು, ಬಿಲ್ ಕಟ್ಟಬಹುದು, ಅಥವಾ {guardian} ಅವರಿಗೆ ಸಂದೇಶ ಕಳಿಸಬಹುದು. "
          "ಯಾರಾದರೂ ಫೋನ್‌ನಲ್ಲಿ ಹಣ ಕೇಳಿದರೆ ನನಗೆ ಹೇಳಿ.",
    "hi": "यहाँ से दवा मँगवाई जा सकती है, बिल भरे जा सकते हैं, या {guardian} को संदेश भेजा जा सकता है। "
          "अगर कोई फ़ोन पर पैसे माँगे तो ज़रूर बताइए।",
    "en": "I can reorder your medicines, pay your bills, or send {guardian} a message. "
          "If anyone asks you for money on the phone, tell me.",
}


def _has(text: str, words: list[str]) -> bool:
    return any(w.lower() in text for w in words)


def handle(svc: BharosaService, hh: Household, text: str) -> dict:
    t = (text or "").lower().strip()
    if not t:
        return {"tool": None, "result": {}, "reply": HELP[hh.parent_language].format(guardian=hh.guardian.name)}

    if assess(t, use_llm=False).score >= 0.35:
        tool, result = "report_suspicious_call", svc.report_suspicious(hh.id, text)
    elif _has(t, STATUS_WORDS):
        tool, result = "check_request_status", svc.request_status(hh.id)
    elif _has(t, MED_WORDS) or any(_has(t, [m.purpose, *m.aliases]) for m in hh.medicines if m.purpose):
        tool, result = "reorder_medicine", svc.reorder_medicine(hh.id, text, None, text)
    elif _has(t, BILL_WORDS):
        if _has(t, PAY_WORDS):
            tool, result = "pay_bill", svc.pay_bill(hh.id, text, text)
        else:
            tool, result = "check_bill", svc.check_bill(hh.id, text)
    elif _has(t, MESSAGE_WORDS):
        tool, result = "message_family", svc.message_family(hh.id, text)
    else:
        return {"tool": None, "result": {}, "reply": HELP[hh.parent_language].format(guardian=hh.guardian.name)}
    return {"tool": tool, "result": result, "reply": result.get("say_to_parent", "")}
