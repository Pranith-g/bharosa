"""Dev helper: create a demo family with one pending bill and print its one-tap approval link.

Approval links normally only travel by push/SMS, so tests and screenshots need a way to get one.
Writes to the same SQLite file the server uses (BHAROSA_SQLITE_PATH, default bharosa.db).

    python scripts/make_approval_link.py [--language kn] [--base http://localhost:8000]
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bharosa.channels import FanOutNotifier  # noqa: E402
from bharosa.cli import create_from_spec, demo_household_spec  # noqa: E402
from bharosa.service import BharosaService  # noqa: E402
from bharosa.store.sqlite import SQLiteStore  # noqa: E402


class Capture(FanOutNotifier):
    def __init__(self):
        super().__init__([])
        self.urls: list[str] = []

    def send(self, hh, title, body, url=None, urgent=False):
        if url:
            self.urls.append(url)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--language", default="kn", choices=["kn", "hi", "en"])
    ap.add_argument("--base", default="http://localhost:8000")
    args = ap.parse_args()
    cap = Capture()
    svc = BharosaService(SQLiteStore(os.getenv("BHAROSA_SQLITE_PATH", "bharosa.db")), notifier=cap, base_url=args.base)
    hh, pk, gk = create_from_spec(svc, demo_household_spec(args.language))
    said = {"kn": "ಕರೆಂಟ್ ಬಿಲ್ ಕಟ್ಟಬೇಕು", "hi": "बिजली का बिल भर दो", "en": "Please pay the electricity bill"}[args.language]
    svc.pay_bill(hh.id, said, said)
    print(json.dumps({"approval_url": cap.urls[-1], "guardian_key": gk, "parent_key": pk}))


if __name__ == "__main__":
    main()
