import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bharosa.channels import FanOutNotifier, SimulatedVoice  # noqa: E402
from bharosa.cli import create_from_spec, demo_household_spec  # noqa: E402
from bharosa.service import BharosaService  # noqa: E402
from bharosa.store.sqlite import SQLiteStore  # noqa: E402


class Clock:
    def __init__(self):
        import time
        self.t = time.time()

    def __call__(self):
        return self.t

    def advance(self, seconds):
        self.t += seconds


class RecordingVoice(SimulatedVoice):
    def __init__(self):
        self.calls = []

    def call_parent(self, hh, message):
        self.calls.append(message)
        return super().call_parent(hh, message)


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def env(clock):
    notifier = FanOutNotifier([])
    voice = RecordingVoice()
    svc = BharosaService(SQLiteStore(":memory:"), notifier=notifier, voice=voice, clock=clock)
    hh, pk, gk = create_from_spec(svc, demo_household_spec("kn"))
    return {"svc": svc, "hh": hh, "pk": pk, "gk": gk, "notifier": notifier, "voice": voice, "clock": clock}
