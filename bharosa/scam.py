"""Scam-signal scoring for what the parent says, in Kannada, Hindi and English.

Deterministic and explainable: each match is a named signal the guardian can see.
An optional Amazon Bedrock judge can raise (never lower) the score.

The patterns target the frauds Indian seniors actually report: "digital arrest"
(fake CBI/police), OTP/PIN theft, remote-access apps, fake electricity
disconnection, and lottery/KYC lures.
"""
from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

# (group, weight, keywords). ASCII keywords match on word boundaries; Indic ones as substrings.
SIGNALS: list[tuple[str, float, list[str]]] = [
    ("authority", 0.25, [
        "cbi", "police", "policeman", "customs", "narcotics", "ncb", "enforcement directorate",
        "rbi", "trai", "income tax", "cyber cell", "crime branch", "court", "judge", "fedex",
        "courier", "parcel", "telecom department", "bank", "bank manager", "customer care",
        "ಪೊಲೀಸ್", "ಪೋಲಿಸ್", "ಸಿಬಿಐ", "ಕೋರ್ಟ್", "ಕಸ್ಟಮ್ಸ್", "ಬ್ಯಾಂಕ್",
        "पुलिस", "सीबीआई", "कोर्ट", "कस्टम", "क्राइम ब्रांच", "बैंक",
    ]),
    ("threat", 0.30, [
        "arrest", "arrested", "warrant", "case against", "jail", "fir", "digital arrest",
        "money laundering", "drugs", "illegal", "suspended", "will be blocked", "disconnect",
        "disconnected", "cut off", "will be cut", "giraftar",
        "ಅರೆಸ್ಟ್", "ಬಂಧನ", "ಕೇಸ್", "ಜೈಲು", "ಕಟ್ ಆಗುತ್ತೆ", "ಕಟ್ ಮಾಡ್ತಾರೆ",
        "गिरफ्तार", "अरेस्ट", "केस", "जेल", "कट जाएगी", "कट जाएगा", "बंद हो जाएगा",
    ]),
    ("money_transfer", 0.30, [
        "transfer", "send money", "pay now", "deposit", "verification amount", "security deposit",
        "refundable", "upi id", "pay to this number", "paisa bhejo", "paise bhejo", "duddu kalisi",
        "ದುಡ್ಡು ಕಳಿಸ", "ಹಣ ಕಳಿಸ", "ಹಣ ವರ್ಗಾವಣೆ", "ದುಡ್ಡು ಹಾಕ",
        "पैसे भेज", "पैसा भेज", "ट्रांसफर", "पैसे डाल",
    ]),
    ("credentials", 0.55, [
        "otp", "pin", "cvv", "password", "card number", "atm pin",
        "ಓಟಿಪಿ", "ಪಿನ್", "ಪಾಸ್ವರ್ಡ್",
        "ओटीपी", "पिन", "पासवर्ड",
    ]),
    ("secrecy", 0.35, [
        "don't tell", "do not tell", "dont tell", "keep it secret", "stay on the call",
        "stay on video", "don't disconnect", "do not disconnect", "don't cut the call",
        "ಯಾರಿಗೂ ಹೇಳ", "ಕಾಲ್ ಕಟ್ ಮಾಡಬೇಡ",
        "किसी को मत", "किसी को न बता", "फोन मत काट", "कॉल मत काट",
    ]),
    ("remote_access", 0.45, [
        "anydesk", "teamviewer", "quicksupport", "quick support", "rustdesk", "screen share",
        "screen sharing", "install this app", "apk",
    ]),
    ("urgency", 0.15, [
        "immediately", "urgent", "tonight", "right now", "within one hour", "within 1 hour",
        "ಈಗಲೇ", "ತಕ್ಷಣ", "ಇವತ್ತು ರಾತ್ರಿ", "ಇವತ್ತೇ",
        "तुरंत", "अभी", "आज रात",
    ]),
    ("lure", 0.30, [
        "lottery", "prize", "you have won", "kbc", "cashback", "kyc", "double your money",
        "guaranteed returns", "trading tips", "investment scheme",
        "ಲಾಟರಿ", "ಬಹುಮಾನ", "ಕೆವೈಸಿ",
        "लॉटरी", "इनाम", "केवाईसी",
    ]),
    ("unknown_caller", 0.10, [
        "someone called", "a call came", "unknown number", "got a call", "they called",
        "ಯಾರೋ ಕಾಲ್", "ಯಾರೋ ಫೋನ್", "ಫೋನ್ ಬಂತು", "ಕಾಲ್ ಬಂತು",
        "किसी ने फोन", "कॉल आया", "फोन आया",
    ]),
]

CATEGORY_LABELS = {
    "digital_arrest": "'digital arrest' scam (fake police/CBI)",
    "official_money_demand": "fake official demanding money",
    "credential_theft": "OTP/PIN theft attempt",
    "remote_access": "remote-access app scam",
    "fake_disconnection": "fake disconnection threat",
    "lottery_or_kyc": "lottery/KYC lure",
    "suspicious": "suspicious request",
    "none": "no clear signals",
}

POWER_WORDS = ["electricity", "power", "current", "bijli", "bescom", "ಕರೆಂಟ್", "ವಿದ್ಯುತ್", "बिजली"]

_ascii = re.compile(r"^[\x00-\x7f]+$")


@dataclass
class ScamAssessment:
    score: float
    signals: list[str] = field(default_factory=list)
    category: str = "none"

    @property
    def is_high(self) -> bool:
        from .policy import SCAM_DENY_THRESHOLD
        return self.score >= SCAM_DENY_THRESHOLD


def _matches(text: str, kw: str) -> bool:
    if _ascii.match(kw):
        return re.search(r"(?<![a-z0-9])" + re.escape(kw) + r"(?![a-z0-9])", text) is not None
    return kw in text


def assess(text: str, use_llm: bool = True) -> ScamAssessment:
    t = (text or "").lower()
    if not t.strip():
        return ScamAssessment(score=0.0)

    groups: dict[str, list[str]] = {}
    for group, _w, kws in SIGNALS:
        hits = [k for k in kws if _matches(t, k)]
        if hits:
            groups[group] = hits
    weights = {g: w for g, w, _ in SIGNALS}

    keep = 1.0
    for g in groups:
        keep *= 1 - weights[g]
    score = 1 - keep
    has = groups.__contains__
    if has("authority") and has("threat"):
        score += 0.35
    if (has("authority") or has("threat")) and has("money_transfer"):
        score += 0.30
    if has("credentials") and (has("unknown_caller") or has("authority") or has("lure")):
        score += 0.25
    if has("remote_access") and (has("lure") or has("authority") or has("unknown_caller")):
        score += 0.30
    score = min(1.0, round(score, 3))

    category = "none"
    if has("authority") and has("threat"):
        category = "digital_arrest"
    elif has("authority") and has("money_transfer"):
        category = "official_money_demand"
    elif has("credentials"):
        category = "credential_theft"
    elif has("remote_access"):
        category = "remote_access"
    elif has("threat") and any(_matches(t, w) for w in POWER_WORDS):
        category = "fake_disconnection"
    elif has("lure"):
        category = "lottery_or_kyc"
    elif groups:
        category = "suspicious"

    signals = [f"{g}: {', '.join(h[:3])}" for g, h in groups.items()]
    result = ScamAssessment(score=score, signals=signals, category=category)

    if use_llm and os.getenv("BHAROSA_BEDROCK_MODEL_ID"):
        llm = _bedrock_judge(text)
        if llm is not None and llm > result.score:
            result.signals.append(f"bedrock_judge: {llm:.2f}")
            result.score = round(llm, 3)
            if result.category == "none":
                result.category = "suspicious"
    return result


def _bedrock_judge(text: str) -> float | None:
    """Optional second opinion from Amazon Bedrock. Can only raise the score. Fails open to rules."""
    try:
        import boto3
        client = boto3.client("bedrock-runtime", region_name=os.getenv("AWS_REGION", "us-east-1"))
        prompt = (
            "You screen what an elderly Indian person says to their assistant for signs they are being "
            "scammed (fake police/CBI 'digital arrest', OTP or PIN requests, remote-access apps, fake "
            "electricity disconnection, lottery/KYC lures). Reply with JSON only: "
            '{"risk": <0..1>}.\n\nThey said: ' + json.dumps(text, ensure_ascii=False)
        )
        resp = client.converse(
            modelId=os.environ["BHAROSA_BEDROCK_MODEL_ID"],
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 50, "temperature": 0},
        )
        out = resp["output"]["message"]["content"][0]["text"]
        m = re.search(r"\{.*\}", out, re.S)
        return max(0.0, min(1.0, float(json.loads(m.group(0))["risk"]))) if m else None
    except Exception as exc:  # never let the judge break the call
        log.warning("bedrock judge unavailable: %s", exc)
        return None


SAFE_SCRIPT = {
    "kn": ("ದಯವಿಟ್ಟು ಯಾರಿಗೂ ಹಣ ಕಳಿಸಬೇಡಿ, ಯಾವುದೇ OTP ಅಥವಾ PIN ಹೇಳಬೇಡಿ. ಪೊಲೀಸ್ ಅಥವಾ CBI ಯಾರನ್ನೂ ಫೋನ್‌ನಲ್ಲಿ "
           "'ಡಿಜಿಟಲ್ ಅರೆಸ್ಟ್' ಮಾಡುವುದಿಲ್ಲ. ಆ ಕಾಲ್ ಕಟ್ ಮಾಡಿ. ನಾನು {guardian} ಅವರಿಗೆ ತಿಳಿಸಿದ್ದೇನೆ. "
           "ಸಹಾಯ ಬೇಕಿದ್ದರೆ 1930 ಗೆ ಕರೆ ಮಾಡಿ."),
    "hi": ("कृपया किसी को पैसे न भेजें और कोई OTP या PIN न बताएं। पुलिस या CBI फ़ोन पर किसी को "
           "'डिजिटल अरेस्ट' नहीं करती। वह कॉल काट दीजिए। मैंने {guardian} को बता दिया है। "
           "मदद के लिए 1930 पर कॉल करें।"),
    "en": ("Please don't send money to anyone and don't share any OTP or PIN. Police or CBI never put "
           "anyone under 'digital arrest' over the phone. Please hang up that call. I've told {guardian}. "
           "If you need help, call 1930, the cyber-fraud helpline."),
}
