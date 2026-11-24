"""The DynamoDB store runs the same flows as SQLite (against moto's DynamoDB)."""
import os

import pytest

moto = pytest.importorskip("moto")


@pytest.fixture
def dynamo_svc(clock):
    os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
    os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
    with moto.mock_aws():
        from bharosa.channels import FanOutNotifier
        from bharosa.cli import create_from_spec, demo_household_spec
        from bharosa.service import BharosaService
        from bharosa.store.dynamo import DynamoStore
        DynamoStore.create_table("bharosa-test", "ap-south-1")
        svc = BharosaService(DynamoStore("bharosa-test", "ap-south-1"), notifier=FanOutNotifier([]), clock=clock)
        hh, pk, gk = create_from_spec(svc, demo_household_spec("hi"))
        yield svc, hh, pk, gk


def test_dynamo_roundtrip(dynamo_svc):
    svc, hh, pk, gk = dynamo_svc
    assert svc.resolve_key(pk)[1] == "parent" and svc.resolve_key(gk)[1] == "guardian"
    assert svc.resolve_key("bp_nope") is None
    assert svc.reorder_medicine(hh.id, "शुगर", None, "शुगर की गोली")["status"] == "completed"
    r = svc.pay_bill(hh.id, "गैस", "गैस का बिल भर दो")
    assert r["status"] == "waiting_for_guardian"
    assert svc.approve(hh.id, r["request_id"])["status"] == "completed"
    st = svc.dashboard_state(hh.id)
    assert st["spent_this_month"] == 180 + 905
    assert [h.id for h in svc.store.list_households()] == [hh.id]
    assert st["events"][0]["ts"] >= st["events"][-1]["ts"]          # newest first
