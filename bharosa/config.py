"""Runtime configuration, all from environment variables (see .env.example)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _bool(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    return default if v is None else v.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    base_url: str
    store: str                       # "sqlite" | "dynamodb"
    sqlite_path: str
    dynamodb_table: str
    aws_region: str
    sns_sms_enabled: bool
    ntfy_server: str
    pharmacy_channel: str            # "simulated" | "elevenlabs"
    callback_channel: str            # "simulated" | "elevenlabs"
    elevenlabs_api_key: str
    elevenlabs_parent_agent_id: str
    elevenlabs_pharmacy_agent_id: str
    elevenlabs_phone_number_id: str
    elevenlabs_telephony: str        # "twilio" | "sip"
    elevenlabs_webhook_secret: str
    admin_token: str


@lru_cache
def settings() -> Settings:
    return Settings(
        base_url=os.getenv("BHAROSA_BASE_URL", "http://localhost:8000").rstrip("/"),
        store=os.getenv("BHAROSA_STORE", "sqlite"),
        sqlite_path=os.getenv("BHAROSA_SQLITE_PATH", "bharosa.db"),
        dynamodb_table=os.getenv("BHAROSA_DYNAMODB_TABLE", "bharosa"),
        aws_region=os.getenv("AWS_REGION", "ap-south-1"),
        sns_sms_enabled=_bool("BHAROSA_SNS_SMS"),
        ntfy_server=os.getenv("BHAROSA_NTFY_SERVER", "https://ntfy.sh").rstrip("/"),
        pharmacy_channel=os.getenv("BHAROSA_PHARMACY_CHANNEL", "simulated"),
        callback_channel=os.getenv("BHAROSA_CALLBACK_CHANNEL", "simulated"),
        elevenlabs_api_key=os.getenv("ELEVENLABS_API_KEY", ""),
        elevenlabs_parent_agent_id=os.getenv("ELEVENLABS_PARENT_AGENT_ID", ""),
        elevenlabs_pharmacy_agent_id=os.getenv("ELEVENLABS_PHARMACY_AGENT_ID", ""),
        elevenlabs_phone_number_id=os.getenv("ELEVENLABS_PHONE_NUMBER_ID", ""),
        elevenlabs_telephony=os.getenv("ELEVENLABS_TELEPHONY", "twilio"),
        elevenlabs_webhook_secret=os.getenv("ELEVENLABS_WEBHOOK_SECRET", ""),
        admin_token=os.getenv("BHAROSA_ADMIN_TOKEN", ""),
    )
