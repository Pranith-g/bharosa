"""Bill fetch/pay adapter.

`SandboxBBPS` behaves like a Bharat BillPay integration (fetch bill by consumer
number, pay, get a receipt) without moving money. A licensed BBPS operator or an
aggregator API replaces it in production behind the same two methods.
"""
from __future__ import annotations

import hashlib
import time
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

BILLERS: dict[str, dict] = {
    "BESCOM": {"name": "BESCOM (Electricity, Bengaluru)", "category": "electricity", "base": 900, "spread": 2200},
    "BWSSB": {"name": "BWSSB (Water, Bengaluru)", "category": "water", "base": 250, "spread": 600},
    "INDANE": {"name": "Indane Gas refill", "category": "gas", "base": 905, "spread": 1},
    "AIRTEL_POSTPAID": {"name": "Airtel Postpaid", "category": "mobile", "base": 399, "spread": 400},
    "JIO_FIBER": {"name": "JioFiber Broadband", "category": "broadband", "base": 699, "spread": 500},
    "BBMP_TAX": {"name": "BBMP Property Tax", "category": "tax", "base": 3500, "spread": 6000},
}


class BillingError(Exception):
    pass


class SandboxBBPS:
    mode = "sandbox"

    def fetch_bill(self, biller_id: str, consumer_number: str) -> dict:
        b = BILLERS.get(biller_id)
        if not b:
            raise BillingError(f"Unknown biller '{biller_id}'")
        if not consumer_number or len(consumer_number) < 4:
            raise BillingError("Consumer number looks invalid")
        # Deterministic per consumer + month, so the same bill shows up on every call.
        month = datetime.now(IST).strftime("%Y-%m")
        h = int(hashlib.sha256(f"{biller_id}:{consumer_number}:{month}".encode()).hexdigest(), 16)
        amount = b["base"] + (h % b["spread"])
        due = (datetime.now(IST).replace(day=1) + timedelta(days=40)).replace(day=10)
        return {
            "biller_id": biller_id,
            "biller_name": b["name"],
            "consumer_number": consumer_number,
            "amount": int(amount),
            "due_date": due.strftime("%d %b %Y"),
            "bill_period": month,
            "mode": self.mode,
        }

    def pay(self, biller_id: str, consumer_number: str, amount: int) -> dict:
        bill = self.fetch_bill(biller_id, consumer_number)
        if amount != bill["amount"]:
            raise BillingError(f"Amount ₹{amount} does not match bill ₹{bill['amount']}")
        ref = hashlib.sha1(f"{biller_id}{consumer_number}{time.time()}".encode()).hexdigest()[:10].upper()
        return {
            "receipt": f"BBPS-SBX-{ref}",
            "paid_at": datetime.now(IST).strftime("%d %b %Y %I:%M %p"),
            "amount": amount,
            "biller_name": bill["biller_name"],
            "mode": self.mode,
        }
