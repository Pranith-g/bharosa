"""Outside-world channels: the pharmacy, the guardian's phone, and the parent's phone.

Each has a `simulated` implementation (works offline, used in tests and demos)
and a real one (ElevenLabs phone calls, ntfy push, Amazon SNS SMS). They are
picked by configuration, so the core service never knows which is in use.
"""
from __future__ import annotations

import logging
from typing import Protocol

import httpx

from . import elevenlabs
from .config import settings
from .models import Action, Household

log = logging.getLogger(__name__)


# --------------------------------------------------------------------- pharmacy
class PharmacyChannel(Protocol):
    name: str
    def place_order(self, hh: Household, action: Action) -> dict: ...


class SimulatedPharmacy:
    """Confirms instantly at the estimated price - stands in for a pharmacist answering the phone."""
    name = "simulated"

    ETA = {"kn": "ಇಂದು ಸಂಜೆ 7 ಗಂಟೆಯೊಳಗೆ", "hi": "आज शाम 7 बजे", "en": "today by 7 pm"}

    def place_order(self, hh: Household, action: Action) -> dict:
        return {"status": "confirmed", "price": action.amount,
                "eta": self.ETA.get(hh.parent_language, self.ETA["en"]),
                "note": f"{hh.pharmacy.name} confirmed (simulated pharmacist)."}


class ElevenLabsPharmacy:
    """Phones the pharmacy with an ElevenLabs agent; the post-call webhook completes the order."""
    name = "elevenlabs"

    def place_order(self, hh: Household, action: Action) -> dict:
        s = settings()
        if not hh.pharmacy.phone:
            raise elevenlabs.ElevenLabsError("No pharmacy phone number on file")
        resp = elevenlabs.outbound_call(
            s.elevenlabs_pharmacy_agent_id, hh.pharmacy.phone,
            {
                "bharosa_household_id": hh.id,
                "bharosa_action_id": action.id,
                "pharmacy_name": hh.pharmacy.name,
                "patient_name": hh.parent_name,
                "medicine_name": action.details.get("medicine_name", ""),
                "quantity": action.details.get("quantity", ""),
                "delivery_note": hh.pharmacy.address_note,
                "max_price": action.amount,
            },
        )
        return {"status": "calling", "conversation_id": resp.get("conversation_id"),
                "note": f"Calling {hh.pharmacy.name} now."}


def pharmacy_channel() -> PharmacyChannel:
    return ElevenLabsPharmacy() if settings().pharmacy_channel == "elevenlabs" else SimulatedPharmacy()


# --------------------------------------------------------------------- guardian notifications
class Notifier(Protocol):
    def send(self, hh: Household, title: str, body: str, url: str | None = None,
             urgent: bool = False) -> None: ...


class NtfyNotifier:
    """Free push notifications: the guardian installs the ntfy app and subscribes to their topic."""

    def send(self, hh, title, body, url=None, urgent=False):
        topic = hh.guardian.ntfy_topic
        if not topic:
            return
        # JSON publishing keeps ₹ and Kannada/Hindi text intact (HTTP headers can't carry UTF-8).
        payload = {"topic": topic, "title": title, "message": body,
                   "priority": 5 if urgent else 3,
                   "tags": ["rotating_light"] if urgent else ["bell"]}
        if url:
            payload["click"] = url
            payload["actions"] = [{"action": "view", "label": "Review", "url": url}]
        try:
            httpx.post(settings().ntfy_server, json=payload, timeout=8)
        except Exception as exc:
            log.warning("ntfy push failed: %s", exc)


class SnsSmsNotifier:
    def send(self, hh, title, body, url=None, urgent=False):
        if not (settings().sns_sms_enabled and hh.guardian.phone):
            return
        try:
            import boto3
            msg = f"Bharosa: {title}\n{body}" + (f"\n{url}" if url else "")
            boto3.client("sns", region_name=settings().aws_region).publish(
                PhoneNumber=hh.guardian.phone, Message=msg[:1500],
                MessageAttributes={"AWS.SNS.SMS.SMSType": {"DataType": "String",
                                   "StringValue": "Transactional"}})
        except Exception as exc:
            log.warning("SNS SMS failed: %s", exc)


class FanOutNotifier:
    def __init__(self, notifiers: list[Notifier]):
        self.notifiers = notifiers
        self.sent: list[dict] = []          # kept for tests / debugging

    def send(self, hh, title, body, url=None, urgent=False):
        self.sent.append({"title": title, "body": body, "url": url, "urgent": urgent})
        for n in self.notifiers:
            n.send(hh, title, body, url, urgent)


def default_notifier() -> FanOutNotifier:
    return FanOutNotifier([NtfyNotifier(), SnsSmsNotifier()])


# --------------------------------------------------------------------- parent callbacks
class ParentVoice(Protocol):
    name: str
    def call_parent(self, hh: Household, message: str) -> dict: ...


class SimulatedVoice:
    name = "simulated"

    def call_parent(self, hh, message):
        return {"status": "simulated", "message": message}


class ElevenLabsVoice:
    """Calls the parent with the same voice agent; `callback_message` is a dynamic variable
    the agent's first message reads out (see deploy/elevenlabs/parent_agent_prompt.md)."""
    name = "elevenlabs"

    def call_parent(self, hh, message):
        if not hh.parent_phone:
            return {"status": "skipped", "reason": "no parent phone"}
        resp = elevenlabs.outbound_call(settings().elevenlabs_parent_agent_id, hh.parent_phone,
                                        {"callback_message": message, "is_callback": "true"})
        return {"status": "calling", "conversation_id": resp.get("conversation_id")}


def parent_voice() -> ParentVoice:
    return ElevenLabsVoice() if settings().callback_channel == "elevenlabs" else SimulatedVoice()
