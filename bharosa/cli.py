"""Command line: `python -m bharosa.cli demo|create|serve|init-dynamo`."""
from __future__ import annotations

import argparse
import json
import sys

from .config import settings
from .models import Guardian, Medicine, Payee, Pharmacy, Policy


def demo_household_spec(language: str = "kn") -> dict:
    return {
        "parent_name": "Lakshmi",
        "language": language,
        "parent_phone": "",
        "guardian": {"name": "Ravi", "relation": "son", "phone": "", "ntfy_topic": ""},
        "pharmacy": {"name": "Sri Sai Medicals", "phone": "", "address_note": "Jayanagar 4th Block, near the temple"},
        "medicines": [
            {"id": "telmisartan", "name": "Telmisartan 40mg", "purpose": "BP",
             "aliases": ["bp", "blood pressure", "ಬಿಪಿ", "ರಕ್ತದೊತ್ತಡ", "बीपी", "ब्लड प्रेशर"],
             "qty_per_order": 30, "unit_price": 6},
            {"id": "metformin", "name": "Metformin 500mg", "purpose": "sugar",
             "aliases": ["sugar", "diabetes", "ಶುಗರ್", "ಸಕ್ಕರೆ", "शुगर", "डायबिटीज"],
             "qty_per_order": 60, "unit_price": 3},
            {"id": "atorvastatin", "name": "Atorvastatin 10mg", "purpose": "cholesterol",
             "aliases": ["cholesterol", "ಕೊಲೆಸ್ಟ್ರಾಲ್", "कोलेस्ट्रॉल"], "qty_per_order": 30, "unit_price": 9},
        ],
        "payees": [
            {"id": "bescom", "name": "BESCOM electricity", "biller_id": "BESCOM", "consumer_number": "7A4521909",
             "category": "electricity", "aliases": ["current bill", "ಕರೆಂಟ್ ಬಿಲ್", "बिजली बिल"]},
            {"id": "bwssb", "name": "BWSSB water", "biller_id": "BWSSB", "consumer_number": "WS0098123",
             "category": "water", "aliases": ["water bill", "ನೀರಿನ ಬಿಲ್", "पानी बिल"]},
            {"id": "indane", "name": "Indane gas", "biller_id": "INDANE", "consumer_number": "IN55310022",
             "category": "gas", "aliases": ["gas cylinder", "ಗ್ಯಾಸ್", "गैस"]},
            {"id": "airtel", "name": "Airtel mobile", "biller_id": "AIRTEL_POSTPAID", "consumer_number": "9845012345",
             "category": "mobile", "aliases": ["phone bill", "ಫೋನ್ ಬಿಲ್", "फोन बिल"]},
        ],
        "policy": {"auto_spend_limit": 500, "monthly_auto_budget": 3000, "hard_cap": 10000},
    }


def create_from_spec(svc, spec: dict):
    return svc.create_household(
        parent_name=spec["parent_name"], language=spec.get("language", "kn"),
        parent_phone=spec.get("parent_phone", ""), guardian=Guardian.model_validate(spec["guardian"]),
        pharmacy=Pharmacy.model_validate(spec.get("pharmacy") or {}),
        medicines=[Medicine.model_validate(m) for m in spec.get("medicines", [])],
        payees=[Payee.model_validate(p) for p in spec.get("payees", [])],
        policy=Policy.model_validate(spec.get("policy") or {}))


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="bharosa")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("demo", help="create the demo household (Lakshmi & Ravi) and print its links")
    d.add_argument("--language", default="kn", choices=["kn", "hi", "en"])
    d.add_argument("--ntfy-topic", default="", help="guardian's ntfy.sh topic for push approvals")
    c = sub.add_parser("create", help="create a household from a JSON spec file")
    c.add_argument("spec")
    s = sub.add_parser("serve", help="run the server")
    s.add_argument("--host", default="0.0.0.0")
    s.add_argument("--port", type=int, default=8000)
    sub.add_parser("init-dynamo", help="create the DynamoDB table (local/dev; use CloudFormation in prod)")
    args = ap.parse_args(argv)

    if args.cmd == "serve":
        import uvicorn
        uvicorn.run("bharosa.api:app_factory", factory=True, host=args.host, port=args.port)
        return
    if args.cmd == "init-dynamo":
        from .store.dynamo import DynamoStore
        DynamoStore.create_table(settings().dynamodb_table, settings().aws_region)
        print("created", settings().dynamodb_table)
        return

    from .api import build_service
    svc = build_service()
    if args.cmd == "demo":
        spec = demo_household_spec(args.language)
        spec["guardian"]["ntfy_topic"] = args.ntfy_topic
    else:
        with open(args.spec, encoding="utf-8") as f:
            spec = json.load(f)
    hh, pk, gk = create_from_spec(svc, spec)
    out = {"household_id": hh.id, "parent_key": pk, "guardian_key": gk, **svc.links(pk, gk)}
    json.dump(out, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
