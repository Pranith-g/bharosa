"""HTTP application: MCP endpoints, guardian API, approval links, onboarding, webhooks, web UI."""
from __future__ import annotations

import contextlib
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from mcp.server.transport_security import TransportSecuritySettings

from . import elevenlabs, intent
from .channels import default_notifier, parent_voice, pharmacy_channel
from .config import settings
from .mcp_server import build_guardian_mcp, build_parent_mcp
from .models import Guardian, Household, Medicine, Payee, Pharmacy, Policy
from .service import BharosaService
from .store import make_store

log = logging.getLogger(__name__)
WEB = Path(__file__).parent / "web"
DIST = WEB / "dist"


def build_service() -> BharosaService:
    s = settings()
    return BharosaService(make_store(), notifier=default_notifier(), voice=parent_voice(),
                          pharmacy=pharmacy_channel(), base_url=s.base_url)


def create_app(svc: BharosaService | None = None) -> FastAPI:
    svc = svc or build_service()
    parent_mcp, guardian_mcp = build_parent_mcp(svc), build_guardian_mcp(svc)
    sec = TransportSecuritySettings(enable_dns_rebinding_protection=False)  # auth is by key, not host
    parent_app = parent_mcp.streamable_http_app(streamable_http_path="/mcp", stateless_http=True,
                                                json_response=True, transport_security=sec)
    guardian_app = guardian_mcp.streamable_http_app(streamable_http_path="/guardian-mcp", stateless_http=True,
                                                    json_response=True, transport_security=sec)

    @contextlib.asynccontextmanager
    async def lifespan(_app: FastAPI):
        async with parent_mcp.session_manager.run(), guardian_mcp.session_manager.run():
            yield

    app = FastAPI(title="Bharosa", version="0.1.0", lifespan=lifespan)
    app.state.svc = svc
    app.router.routes.extend(parent_app.routes + guardian_app.routes)
    app.mount("/static", StaticFiles(directory=WEB), name="static")

    # ------------------------------------------------------------------ auth helpers
    def guardian_hh(x_bharosa_key: str | None = Header(default=None)) -> Household:
        found = svc.resolve_key(x_bharosa_key)
        if not found or found[1] != "guardian":
            raise HTTPException(401, "guardian key required")
        return found[0]

    def parent_hh(x_bharosa_key: str | None = Header(default=None)) -> Household:
        found = svc.resolve_key(x_bharosa_key)
        if not found or found[1] != "parent":
            raise HTTPException(401, "parent key required")
        return found[0]

    def _ok(res: dict) -> dict:
        if not res.get("ok", True):
            raise HTTPException(409, res.get("error", "conflict"))
        return res

    # ------------------------------------------------------------------ pages
    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "store": settings().store, "pharmacy": svc.pharmacy.name, "voice": svc.voice.name}

    # The React app (frontend/ -> `npm run build` -> web/dist) serves the main routes when it has been built.
    # The original vanilla pages stay available under /classic/... (and serve the main routes if dist is missing).
    classic = {"/": "index.html", "/g": "guardian.html", "/p": "simulator.html", "/setup": "setup.html"}
    for route, page in classic.items():
        app.add_api_route(f"/classic{route.rstrip('/')}", (lambda p=page: FileResponse(WEB / p)),
                          methods=["GET"], include_in_schema=False)
    app.add_api_route("/classic/", lambda: FileResponse(WEB / "index.html"), methods=["GET"], include_in_schema=False)
    app.add_api_route("/classic/a/{hh_id}/{action_id}", lambda hh_id, action_id: FileResponse(WEB / "approve.html"),
                      methods=["GET"], include_in_schema=False)

    spa_index = DIST / "index.html"
    if spa_index.exists():
        if (DIST / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")
        for f in DIST.iterdir():                       # icon.svg, manifest.webmanifest, ...
            if f.is_file() and f.name != "index.html":
                app.add_api_route(f"/{f.name}", (lambda f=f: FileResponse(f)), methods=["GET"], include_in_schema=False)
        spa = lambda: FileResponse(spa_index, headers={"Cache-Control": "no-cache"})  # noqa: E731
        for route in ("/", "/g", "/p", "/setup", "/demo"):
            app.add_api_route(route, spa, methods=["GET"], include_in_schema=False)
        app.add_api_route("/a/{hh_id}/{action_id}", lambda hh_id, action_id: spa(), methods=["GET"], include_in_schema=False)
    else:
        for route, page in classic.items():
            app.add_api_route(route, (lambda p=page: FileResponse(WEB / p)), methods=["GET"], include_in_schema=False)
        app.add_api_route("/a/{hh_id}/{action_id}", lambda hh_id, action_id: FileResponse(WEB / "approve.html"),
                          methods=["GET"], include_in_schema=False)

    # ------------------------------------------------------------------ guardian API
    @app.get("/api/state")
    def state(hh: Household = Depends(guardian_hh)) -> dict:
        return svc.dashboard_state(hh.id)

    @app.post("/api/actions/{action_id}/approve")
    def approve(action_id: str, hh: Household = Depends(guardian_hh)) -> dict:
        return _ok(svc.approve(hh.id, action_id, by=f"{hh.guardian.name} (dashboard)"))

    @app.post("/api/actions/{action_id}/deny")
    def deny(action_id: str, hh: Household = Depends(guardian_hh)) -> dict:
        return _ok(svc.deny(hh.id, action_id, by=f"{hh.guardian.name} (dashboard)"))

    @app.patch("/api/policy")
    def patch_policy(patch: dict[str, Any] = Body(...), hh: Household = Depends(guardian_hh)) -> dict:
        try:
            return svc.update_policy(hh.id, patch).model_dump()
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    @app.post("/api/scam-lock/clear")
    def clear_lock(hh: Household = Depends(guardian_hh)) -> dict:
        svc.clear_scam_lock(hh.id)
        return {"ok": True}

    @app.put("/api/profile")
    def put_profile(patch: dict[str, Any] = Body(...), hh: Household = Depends(guardian_hh)) -> dict:
        try:
            return svc.update_profile(hh.id, patch).model_dump(exclude={"policy"})
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    @app.get("/api/connect")
    def connect_info(hh: Household = Depends(guardian_hh)) -> dict:
        s = settings()
        return {"base_url": svc.base_url, "elevenlabs_agent_id": s.elevenlabs_parent_agent_id,
                "pharmacy_channel": svc.pharmacy.name, "callback_channel": svc.voice.name}

    # ------------------------------------------------------------------ one-tap approval links
    @app.get("/api/approval/{hh_id}/{action_id}")
    def approval_info(hh_id: str, action_id: str, t: str) -> dict:
        act = svc.store.get_action(hh_id, action_id)
        hh = svc.store.get_household(hh_id)
        if not act or not hh:
            raise HTTPException(404, "not found")
        import secrets as _secrets
        from .service import _hash
        if not act.approval_token_hash or not _secrets.compare_digest(act.approval_token_hash, _hash(t)):
            raise HTTPException(403, "invalid link")
        return {"parent": hh.parent_name, "guardian": hh.guardian.name, "title": act.title,
                "amount": act.amount, "status": act.status, "parent_said": act.parent_said,
                "reasons": act.decision.reasons if act.decision else [], "risk_score": act.risk_score,
                "risk_signals": act.risk_signals, "created_at": act.created_at, "expires_at": act.expires_at}

    @app.post("/api/approval/{hh_id}/{action_id}")
    def approval_decide(hh_id: str, action_id: str, body: dict[str, Any] = Body(...)) -> dict:
        res = svc.decide_with_token(hh_id, action_id, str(body.get("t", "")), body.get("decision") == "approve")
        if not res.get("ok"):
            raise HTTPException(403 if "invalid" in res.get("error", "") else 409, res.get("error"))
        return res

    # ------------------------------------------------------------------ parent simulator
    @app.post("/api/sim/say")
    def sim_say(body: dict[str, Any] = Body(...), hh: Household = Depends(parent_hh)) -> dict:
        return intent.handle(svc, hh, str(body.get("text", ""))[:500])

    @app.get("/api/sim/state")
    def sim_state(hh: Household = Depends(parent_hh)) -> dict:
        events = svc.store.list_events(hh.id, 30)
        return {"parent_name": hh.parent_name, "language": hh.parent_language, "guardian": hh.guardian.name,
                "medicines": [m.name for m in hh.medicines], "bills": [p.name for p in hh.payees],
                "elevenlabs_agent_id": settings().elevenlabs_parent_agent_id,
                "callbacks": [{"id": e.id, "ts": e.ts, "message": e.summary} for e in events
                              if e.type == "parent_callback"]}

    # ------------------------------------------------------------------ onboarding
    @app.post("/api/households")
    def create_household(body: dict[str, Any] = Body(...),
                         x_admin_token: str | None = Header(default=None)) -> dict:
        s = settings()
        if s.admin_token and x_admin_token != s.admin_token:
            raise HTTPException(401, "admin token required")
        try:
            hh, pk, gk = svc.create_household(
                parent_name=body["parent_name"], language=body.get("language", "kn"),
                parent_phone=body.get("parent_phone", ""),
                guardian=Guardian.model_validate(body["guardian"]),
                pharmacy=Pharmacy.model_validate(body.get("pharmacy") or {}),
                medicines=[Medicine.model_validate(m) for m in body.get("medicines", [])],
                payees=[Payee.model_validate(p) for p in body.get("payees", [])],
                policy=Policy.model_validate(body.get("policy") or {}))
        except (KeyError, ValueError) as exc:
            raise HTTPException(422, f"invalid household: {exc}")
        return {"household_id": hh.id, "parent_key": pk, "guardian_key": gk, **svc.links(pk, gk)}

    # ------------------------------------------------------------------ ElevenLabs post-call webhook
    @app.post("/webhooks/elevenlabs")
    async def elevenlabs_webhook(request: Request) -> JSONResponse:
        raw = await request.body()
        secret = settings().elevenlabs_webhook_secret
        if secret and not elevenlabs.verify_webhook(raw, request.headers.get("elevenlabs-signature"), secret):
            raise HTTPException(401, "bad signature")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            raise HTTPException(400, "bad json")
        if payload.get("type") != "post_call_transcription":
            return JSONResponse({"ok": True, "ignored": payload.get("type")})
        data = payload.get("data", {})
        dyn = (data.get("conversation_initiation_client_data") or {}).get("dynamic_variables") or {}
        hh_id, action_id = dyn.get("bharosa_household_id"), dyn.get("bharosa_action_id")
        if not (hh_id and action_id):
            return JSONResponse({"ok": True, "ignored": "not a pharmacy call"})
        dc = (data.get("analysis") or {}).get("data_collection_results") or {}

        def val(name: str):
            v = dc.get(name)
            return v.get("value") if isinstance(v, dict) else v

        available = val("medicine_available")
        available = available if isinstance(available, bool) else str(available).lower() in {"true", "yes", "1"}
        price = val("total_price")
        try:
            price = int(float(price)) if price not in (None, "") else None
        except (TypeError, ValueError):
            price = None
        res = svc.handle_pharmacy_result(hh_id, action_id, available, price, val("delivery_eta"),
                                         note=str(((data.get("analysis") or {}).get("transcript_summary")) or "")[:300])
        return JSONResponse(res)

    return app


def app_factory() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    return create_app()
