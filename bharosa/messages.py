"""What the agent should say to the parent, in the parent's language.

The voice agent (an LLM) could translate on its own, but fixed, reviewed phrasing
for money and safety messages is more reliable - "less magic, more utility".
Hindi uses impersonal constructions so the agent's voice gender doesn't matter.
"""
from __future__ import annotations

from .scam import SAFE_SCRIPT

M: dict[str, dict[str, str]] = {
    "order_placed": {
        "kn": "{pharmacy} ಗೆ {medicine} ಆರ್ಡರ್ ಮಾಡಿದ್ದೇನೆ. ಒಟ್ಟು ₹{amount}. {eta} ಮನೆಗೆ ಬರುತ್ತದೆ.",
        "hi": "{pharmacy} से {medicine} मँगवा दी गई है। कुल ₹{amount}। {eta} तक घर आ जाएगी।",
        "en": "I've ordered {medicine} from {pharmacy}. Total ₹{amount}. It will reach you {eta}.",
    },
    "order_calling": {
        "kn": "{pharmacy} ಗೆ ಈಗ ಕಾಲ್ ಮಾಡುತ್ತಿದ್ದೇನೆ. ಆರ್ಡರ್ ಆದ ಮೇಲೆ ನಿಮಗೆ ತಿಳಿಸುತ್ತೇನೆ.",
        "hi": "अभी {pharmacy} को फ़ोन किया जा रहा है। ऑर्डर होते ही आपको बताया जाएगा।",
        "en": "I'm calling {pharmacy} now. I'll let you know once the order is placed.",
    },
    "approval_sent": {
        "kn": "ಇದಕ್ಕೆ {guardian} ಅವರ ಒಪ್ಪಿಗೆ ಬೇಕು. ಅವರನ್ನು ಕೇಳಿದ್ದೇನೆ, ಒಪ್ಪಿದ ತಕ್ಷಣ ನಿಮಗೆ ಕಾಲ್ ಮಾಡುತ್ತೇನೆ.",
        "hi": "इसके लिए {guardian} की मंज़ूरी चाहिए। उनसे पूछ लिया गया है, मंज़ूरी मिलते ही आपको फ़ोन आएगा।",
        "en": "This needs {guardian}'s okay. I've asked them, and I'll call you back as soon as they reply.",
    },
    "bill_paid": {
        "kn": "{biller} ಬಿಲ್ ₹{amount} ಕಟ್ಟಿದ್ದೇನೆ. ರಸೀದಿ ಸಂಖ್ಯೆ {receipt}.",
        "hi": "{biller} का बिल ₹{amount} भर दिया गया है। रसीद नंबर {receipt}।",
        "en": "I've paid the {biller} bill of ₹{amount}. Receipt number {receipt}.",
    },
    "bill_info": {
        "kn": "{biller} ಬಿಲ್ ₹{amount}. ಕೊನೆಯ ದಿನಾಂಕ {due}. ಕಟ್ಟಬೇಕಾ?",
        "hi": "{biller} का बिल ₹{amount} है, आख़िरी तारीख़ {due}। क्या भर दें?",
        "en": "The {biller} bill is ₹{amount}, due {due}. Shall I pay it?",
    },
    "already_paid": {
        "kn": "{biller} ಬಿಲ್ ಈಗಾಗಲೇ ಕಟ್ಟಲಾಗಿದೆ. ರಸೀದಿ {receipt}.",
        "hi": "{biller} का बिल पहले ही भरा जा चुका है। रसीद {receipt}।",
        "en": "The {biller} bill is already paid. Receipt {receipt}.",
    },
    "already_pending": {
        "kn": "ಇದನ್ನು ಈಗಾಗಲೇ ಕೇಳಿದ್ದೇನೆ, {guardian} ಅವರ ಉತ್ತರಕ್ಕೆ ಕಾಯುತ್ತಿದ್ದೇನೆ.",
        "hi": "यह पहले ही पूछा जा चुका है, {guardian} के जवाब का इंतज़ार है।",
        "en": "I've already asked for this and I'm waiting for {guardian}.",
    },
    "denied_frozen": {
        "kn": "ಈಗ {guardian} ಅವರು ಹಣ ಪಾವತಿಯನ್ನು ನಿಲ್ಲಿಸಿದ್ದಾರೆ. ದಯವಿಟ್ಟು ಅವರೊಡನೆ ಮಾತಾಡಿ.",
        "hi": "अभी {guardian} ने सभी भुगतान रोक रखे हैं। कृपया उनसे बात करें।",
        "en": "{guardian} has paused all payments for now. Please speak to them.",
    },
    "denied_locked": {
        "kn": "ನಿಮ್ಮ ಸುರಕ್ಷತೆಗಾಗಿ ಸ್ವಲ್ಪ ಸಮಯ ಯಾವುದೇ ಹಣ ಪಾವತಿ ಮಾಡುವುದಿಲ್ಲ. {guardian} ಅವರಿಗೆ ತಿಳಿಸಿದ್ದೇನೆ.",
        "hi": "आपकी सुरक्षा के लिए कुछ समय तक कोई भुगतान नहीं होगा। {guardian} को बता दिया गया है।",
        "en": "For your safety, no payments will be made for a little while. I've told {guardian}.",
    },
    "denied_generic": {
        "kn": "ಕ್ಷಮಿಸಿ, ಇದನ್ನು ನಾನು ಮಾಡಲು ಆಗುವುದಿಲ್ಲ. {guardian} ಅವರಿಗೆ ತಿಳಿಸಿದ್ದೇನೆ.",
        "hi": "माफ़ कीजिए, यह काम नहीं किया जा सकता। {guardian} को बता दिया गया है।",
        "en": "Sorry, I can't do that. I've let {guardian} know.",
    },
    "not_found_medicine": {
        "kn": "ಯಾವ ಮಾತ್ರೆ ಬೇಕು ಎಂದು ಗೊತ್ತಾಗಲಿಲ್ಲ. ನಿಮ್ಮ ಪಟ್ಟಿಯಲ್ಲಿ ಇವು ಇವೆ: {options}.",
        "hi": "कौन सी दवा चाहिए, यह समझ नहीं आया। आपकी सूची में ये हैं: {options}।",
        "en": "I'm not sure which medicine you mean. Your list has: {options}.",
    },
    "not_found_payee": {
        "kn": "ಯಾವ ಬಿಲ್ ಎಂದು ಗೊತ್ತಾಗಲಿಲ್ಲ. ನಿಮ್ಮ ಪಟ್ಟಿಯಲ್ಲಿ ಇವು ಇವೆ: {options}.",
        "hi": "कौन सा बिल, यह समझ नहीं आया। आपकी सूची में ये हैं: {options}।",
        "en": "I'm not sure which bill you mean. Your list has: {options}.",
    },
    "message_sent": {
        "kn": "ನಿಮ್ಮ ಸಂದೇಶವನ್ನು {guardian} ಅವರಿಗೆ ಕಳಿಸಿದ್ದೇನೆ.",
        "hi": "आपका संदेश {guardian} को भेज दिया गया है।",
        "en": "I've sent your message to {guardian}.",
    },
    "status_pending": {
        "kn": "ಇನ್ನೂ {guardian} ಅವರ ಒಪ್ಪಿಗೆಗೆ ಕಾಯುತ್ತಿದ್ದೇನೆ.",
        "hi": "अभी {guardian} की मंज़ूरी का इंतज़ार है।",
        "en": "Still waiting for {guardian} to approve.",
    },
    "status_denied": {
        "kn": "{guardian} ಅವರು ಇದಕ್ಕೆ ಈಗ ಬೇಡ ಎಂದಿದ್ದಾರೆ.",
        "hi": "{guardian} ने अभी इसके लिए मना किया है।",
        "en": "{guardian} said no to this for now.",
    },
    "status_expired": {
        "kn": "{guardian} ಅವರಿಂದ ಉತ್ತರ ಬರಲಿಲ್ಲ, ಆ ವಿನಂತಿ ರದ್ದಾಗಿದೆ. ಬೇಕಿದ್ದರೆ ಮತ್ತೆ ಕೇಳುತ್ತೇನೆ.",
        "hi": "{guardian} का जवाब नहीं आया, इसलिए वह अनुरोध रद्द हो गया। चाहें तो फिर से पूछा जा सकता है।",
        "en": "{guardian} didn't reply in time, so that request expired. I can ask again if you like.",
    },
    "pharmacy_unavailable": {
        "kn": "{pharmacy} ಅಲ್ಲಿ {medicine} ಈಗ ಸಿಗುತ್ತಿಲ್ಲ. {guardian} ಅವರಿಗೆ ತಿಳಿಸಿದ್ದೇನೆ.",
        "hi": "{pharmacy} में अभी {medicine} उपलब्ध नहीं है। {guardian} को बता दिया गया है।",
        "en": "{pharmacy} doesn't have {medicine} right now. I've told {guardian}.",
    },
    "callback_approved": {
        "kn": "ನಮಸ್ಕಾರ {parent}. {guardian} ಅವರು ಒಪ್ಪಿದ್ದಾರೆ. {result}",
        "hi": "नमस्ते {parent}। {guardian} ने मंज़ूरी दे दी है। {result}",
        "en": "Hello {parent}. {guardian} approved it. {result}",
    },
    "callback_denied": {
        "kn": "ನಮಸ್ಕಾರ {parent}. {guardian} ಅವರು ಈಗ ಬೇಡ ಎಂದಿದ್ದಾರೆ: {title}.",
        "hi": "नमस्ते {parent}। {guardian} ने अभी इसके लिए मना किया है: {title}।",
        "en": "Hello {parent}. {guardian} said not right now to: {title}.",
    },
    "callback_order": {
        "kn": "ನಮಸ್ಕಾರ {parent}. {result}",
        "hi": "नमस्ते {parent}। {result}",
        "en": "Hello {parent}. {result}",
    },
    "gentle_safety": {
        "kn": "ತಿಳಿಸಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದ. ಯಾರಾದರೂ ಫೋನ್‌ನಲ್ಲಿ ಹಣ, OTP ಅಥವಾ PIN ಕೇಳಿದರೆ ಕೊಡಬೇಡಿ.",
        "hi": "बताने के लिए धन्यवाद। अगर कोई फ़ोन पर पैसे, OTP या PIN माँगे तो मत दीजिए।",
        "en": "Thank you for telling me. If anyone asks for money, an OTP or a PIN on the phone, don't give it.",
    },
}


def say(key: str, lang: str, **kw) -> str:
    table = M[key]
    return table.get(lang, table["en"]).format(**kw)


def safe_script(lang: str, guardian: str) -> str:
    return SAFE_SCRIPT.get(lang, SAFE_SCRIPT["en"]).format(guardian=guardian)
