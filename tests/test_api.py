import json

import pytest
from fastapi.testclient import TestClient

from bharosa import elevenlabs
from bharosa.api import create_app


@pytest.fixture
def client(env):
    with TestClient(create_app(env["svc"])) as c:
        yield c


def G(env):
    return {"X-Bharosa-Key": env["gk"]}


def P(env):
    return {"X-Bharosa-Key": env["pk"]}


def test_pages_and_health(client):
    assert client.get("/health").json()["ok"]
    for path in ["/", "/g", "/p", "/setup", "/static/style.css"]:
        assert client.get(path).status_code == 200, path


def test_guardian_api_requires_guardian_key(client, env):
    assert client.get("/api/state").status_code == 401
    assert client.get("/api/state", headers=P(env)).status_code == 401      # parent key is not enough
    st = client.get("/api/state", headers=G(env)).json()
    assert st["household"]["parent_name"] == "Lakshmi" and "guardian" in st["household"]


def test_full_flow_through_http(client, env):
    r = client.post("/api/sim/say", headers=P(env), json={"text": "pay the gas bill"}).json()
    assert r["tool"] == "pay_bill" and r["result"]["status"] == "waiting_for_guardian"
    st = client.get("/api/state", headers=G(env)).json()
    assert len(st["pending"]) == 1 and "approval_token_hash" not in st["pending"][0]
    aid = st["pending"][0]["id"]
    ok = client.post(f"/api/actions/{aid}/approve", headers=G(env)).json()
    assert ok["status"] == "completed"
    assert client.post(f"/api/actions/{aid}/approve", headers=G(env)).status_code == 409
    sim = client.get("/api/sim/state", headers=P(env)).json()
    assert sim["callbacks"], "parent should get a call back"


def test_approval_link_endpoints(client, env):
    client.post("/api/sim/say", headers=P(env), json={"text": "pay the gas bill"})
    url = env["notifier"].sent[-1]["url"]
    path, token = url.split("localhost:8000")[1].split("?t=")
    _, _, hh, aid = path.split("/")
    assert client.get(path).status_code == 200                                     # the HTML page
    assert client.get(f"/api/approval/{hh}/{aid}?t=nope").status_code == 403
    info = client.get(f"/api/approval/{hh}/{aid}?t={token}").json()
    assert info["status"] == "pending_approval" and info["amount"] == 905
    assert client.post(f"/api/approval/{hh}/{aid}", json={"t": "nope", "decision": "approve"}).status_code == 403
    assert client.post(f"/api/approval/{hh}/{aid}", json={"t": token, "decision": "deny"}).json()["status"] == "denied"
    assert client.get(f"/api/approval/{hh}/{aid}?t={token}").json()["status"] == "denied"


def test_policy_freeze_and_limits(client, env):
    assert client.patch("/api/policy", headers=G(env), json={"frozen": True}).json()["frozen"] is True
    r = client.post("/api/sim/say", headers=P(env), json={"text": "my BP tablets are over"}).json()
    assert r["result"]["status"] == "blocked"
    client.patch("/api/policy", headers=G(env), json={"frozen": False, "auto_spend_limit": 1000})
    r = client.post("/api/sim/say", headers=P(env), json={"text": "pay the gas bill"}).json()
    assert r["result"]["status"] == "completed"                                    # 905 <= 1000 now


def test_onboarding_creates_household_with_links(client):
    body = {"parent_name": "Kamala", "language": "hi", "guardian": {"name": "Asha", "relation": "daughter"},
            "medicines": [{"id": "m1", "name": "Amlodipine 5mg", "purpose": "BP", "unit_price": 4}],
            "payees": [{"id": "b1", "name": "BESCOM", "biller_id": "BESCOM", "consumer_number": "12345678",
                        "category": "electricity"}]}
    out = client.post("/api/households", json=body).json()
    assert out["parent_mcp_url"].endswith(out["parent_key"]) and out["guardian_key"].startswith("bg_")
    st = client.get("/api/state", headers={"X-Bharosa-Key": out["guardian_key"]}).json()
    assert st["household"]["parent_language"] == "hi"
    assert client.post("/api/households", json={"parent_name": "x"}).status_code == 422


def test_elevenlabs_webhook_completes_pharmacy_order(client, env, monkeypatch):
    svc, hh = env["svc"], env["hh"]

    class CallingPharmacy:
        name = "test-call"
        def place_order(self, hh, action):
            return {"status": "calling"}
    svc.pharmacy = CallingPharmacy()
    aid = svc.reorder_medicine(hh.id, "BP", None, "BP")["request_id"]

    import bharosa.api as api_mod
    secret = "whsec_test"
    real = api_mod.settings()
    monkeypatch.setattr(api_mod, "settings", lambda: real.__class__(**{**real.__dict__,
                                                                      "elevenlabs_webhook_secret": secret}))
    payload = {"type": "post_call_transcription", "data": {
        "conversation_initiation_client_data": {"dynamic_variables": {
            "bharosa_household_id": hh.id, "bharosa_action_id": aid}},
        "analysis": {"transcript_summary": "Pharmacist confirmed.", "data_collection_results": {
            "medicine_available": {"value": True}, "total_price": {"value": "176"},
            "delivery_eta": {"value": "by 6 pm"}}}}}
    raw = json.dumps(payload).encode()
    bad = client.post("/webhooks/elevenlabs", content=raw, headers={"ElevenLabs-Signature": "t=1,v0=bad"})
    assert bad.status_code == 401
    ok = client.post("/webhooks/elevenlabs", content=raw,
                     headers={"ElevenLabs-Signature": elevenlabs.sign_webhook(raw, secret),
                              "Content-Type": "application/json"})
    assert ok.json()["status"] == "completed"
    act = svc.store.get_action(hh.id, aid)
    assert act.amount == 176 and act.status == "completed"
