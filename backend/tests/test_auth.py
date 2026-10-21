import asyncio
import base64
import json
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import jwt
import pytest
import time_machine
from argon2 import PasswordHasher
from argon2.low_level import Type
from starlette.testclient import TestClient

from app import create_app
from security.config import AuthSettings
from security.notifications import deliver_pending
from security.service import AuthService, LOGIN_ERROR, TOKEN_SECONDS, now
from services.broadcast import Broadcaster
from tests.conftest import PASSWORD, active, headers, login, signup


async def test_expiry_exactly_30_minutes_and_claims(env):
    app, client, _ = env
    with time_machine.travel(
        datetime(2030, 1, 1, tzinfo=timezone.utc), tick=False
    ) as clock:
        response = await login(client)
        token = response.json()["access_token"]
        claims = jwt.decode(
            token,
            app.state.auth.settings.signing_key,
            algorithms=["HS256"],
            audience="dava-api",
            issuer="dava-auth",
        )
        assert set(claims) == {"sub", "exp", "iat", "jti", "iss", "aud"}
        assert claims["exp"] - claims["iat"] == 1800
        auth = {"Authorization": f"Bearer {token}"}
        clock.shift(timedelta(seconds=1799))
        assert (await client.get("/api/auth/me", headers=auth)).status_code == 200
        clock.shift(timedelta(seconds=1))
        assert (await client.get("/api/auth/me", headers=auth)).status_code == 401


async def test_logout_denylist_ttl_and_reuse_across_service_restart(env):
    app, client, _ = env
    with time_machine.travel(
        datetime(2030, 1, 1, tzinfo=timezone.utc), tick=False
    ) as clock:
        auth = await headers(client)
        clock.shift(timedelta(minutes=12))
        response = await client.post("/api/auth/logout", headers=auth)
        assert response.status_code == 204
        with app.state.auth.connect() as db:
            row = db.execute("SELECT * FROM auth_denylist").fetchone()
            assert row["expires_at"] - now() == 18 * 60
        other = AuthService(app.state.auth.db_path, app.state.auth.settings)
        with pytest.raises(Exception) as exc:
            other.authenticate(auth["Authorization"][7:])
        assert exc.value.status_code == 401
        for method, path in [
            ("GET", "/api/auth/me"),
            ("POST", "/api/system/start"),
            ("GET", "/api/readings/history"),
        ]:
            assert (await client.request(method, path, headers=auth)).status_code == 401


async def test_pending_no_role_and_notification_contains_name_email(env):
    app, client, _ = env
    user = await signup(app, client)
    assert user["status"] == "pending" and user["role"] is None
    assert user["password_hash"].startswith("$argon2id$v=19$m=65536,t=3,p=4$")
    with app.state.auth.connect() as db:
        row = db.execute("SELECT * FROM auth_outbox").fetchone()
        assert (row["recipient"], row["applicant_email"], row["applicant_name"]) == (
            "admin@example.com",
            "worker@example.com",
            "Applicant",
        )
    result = await login(client, "worker@example.com")
    assert result.status_code == 401 and result.json() == {"detail": LOGIN_ERROR}


async def test_rejected_user_blocked_and_audited(env):
    app, client, admin = env
    user = await signup(app, client)
    auth = await headers(client)
    assert (
        await client.post(f"/api/admin/users/{user['id']}/reject", headers=auth)
    ).status_code == 200
    assert (await login(client, "worker@example.com")).status_code == 401
    events = (await client.get("/api/admin/audit", headers=auth)).json()
    assert events[0]["action"] == "reject" and events[0]["actor_id"] == admin["id"]
    assert json.loads(events[0]["after_state"]) == {"status": "rejected", "role": None}


@pytest.mark.parametrize(
    "extra", [{"role": "sysadmin"}, {"status": "active"}, {"is_admin": True}]
)
async def test_signup_mass_assignment_rejected(env, extra):
    app, client, _ = env
    response = await client.post(
        "/api/auth/signup",
        json={
            "email": "evil@example.com",
            "name": "Evil",
            "password": PASSWORD,
            **extra,
        },
    )
    assert response.status_code == 422
    assert PASSWORD not in response.text
    with app.state.auth.connect() as db:
        assert db.execute("SELECT count(*) FROM auth_users").fetchone()[0] == 1


async def test_worker_cannot_approve_escalate_or_read_audit(env):
    app, client, admin = env
    user, worker, _ = await active(app, client)
    for method, path, body in [
        ("PATCH", f"/api/admin/users/{user['id']}/role", {"role": "sysadmin"}),
        ("PATCH", f"/api/admin/users/{admin['id']}/status", {"status": "suspended"}),
        ("POST", f"/api/admin/users/{user['id']}/approve", {"role": "sysadmin"}),
        ("GET", "/api/admin/users", None),
        ("GET", "/api/admin/audit", None),
        ("POST", "/api/system/clear-logs", None),
    ]:
        response = await client.request(
            method, path, headers=worker, **({"json": body} if body else {})
        )
        assert response.status_code == 403, (path, response.text)


@pytest.mark.parametrize(
    "attack",
    [
        "tamper",
        "none",
        "HS384",
        "wrong_key",
        "issuer",
        "audience",
        "missing_exp",
        "missing_jti",
        "future_iat",
        "long_lifetime",
        "bad_typ",
        "role_claim",
    ],
)
async def test_token_attacks(env, attack):
    app, client, _ = env
    user, worker, _ = await active(app, client)
    token = worker["Authorization"][7:]
    claims = jwt.decode(token, options={"verify_signature": False})
    key = app.state.auth.settings.signing_key
    alg = "HS256"
    header = {"typ": "at+jwt"}
    if attack == "tamper":
        payload = (
            base64.urlsafe_b64encode(json.dumps({**claims, "sub": "attacker"}).encode())
            .rstrip(b"=")
            .decode()
        )
        parts = token.split(".")
        parts[1] = payload
        token = ".".join(parts)
    else:
        if attack == "none":
            alg = "none"
            key = ""
        if attack == "HS384":
            alg = "HS384"
            key = secrets.token_bytes(48)
        if attack == "wrong_key":
            key = secrets.token_bytes(32)
        if attack == "issuer":
            claims["iss"] = "evil"
        if attack == "audience":
            claims["aud"] = "other"
        if attack == "missing_exp":
            claims.pop("exp")
        if attack == "missing_jti":
            claims.pop("jti")
        if attack == "future_iat":
            claims["iat"] += 60
            claims["exp"] += 60
        if attack == "long_lifetime":
            claims["exp"] += 1
        if attack == "bad_typ":
            header["typ"] = "JWT"
        if attack == "role_claim":
            claims["role"] = "sysadmin"
            claims["status"] = "active"
        token = jwt.encode(claims, key, algorithm=alg, headers=header)
    response = await client.get(
        "/api/admin/users" if attack == "role_claim" else "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == (403 if attack == "role_claim" else 401)


async def test_demotion_mid_session_and_audit(env):
    app, client, _ = env
    user, second_admin, first_admin = await active(app, client, role="sysadmin")
    assert (
        await client.get("/api/admin/users", headers=second_admin)
    ).status_code == 200
    assert (
        await client.patch(
            f"/api/admin/users/{user['id']}/role",
            headers=first_admin,
            json={"role": "worker"},
        )
    ).status_code == 200
    assert (
        await client.get("/api/admin/users", headers=second_admin)
    ).status_code == 403
    assert (await client.get("/api/auth/me", headers=second_admin)).json()[
        "role"
    ] == "worker"
    events = (await client.get("/api/admin/audit", headers=first_admin)).json()
    assert events[0]["action"] == "role_change"
    assert json.loads(events[0]["before_state"])["role"] == "sysadmin"
    assert json.loads(events[0]["after_state"])["role"] == "worker"


async def test_suspension_mid_session(env):
    app, client, _ = env
    user, worker, admin = await active(app, client)
    assert (
        await client.patch(
            f"/api/admin/users/{user['id']}/status",
            headers=admin,
            json={"status": "suspended"},
        )
    ).status_code == 200
    assert (await client.get("/api/system/state", headers=worker)).status_code == 401
    assert (await login(client, "worker@example.com")).status_code == 401


async def test_nonactive_even_validly_signed_token_blocked(env):
    app, client, _ = env
    user = await signup(app, client)
    claims = {
        "sub": user["id"],
        "iat": now(),
        "exp": now() + 1800,
        "jti": str(__import__("uuid").uuid4()),
        "iss": "dava-auth",
        "aud": "dava-api",
    }
    token = jwt.encode(
        claims,
        app.state.auth.settings.signing_key,
        algorithm="HS256",
        headers={"typ": "at+jwt"},
    )
    auth = {"Authorization": f"Bearer {token}"}
    assert (await client.get("/api/system/state", headers=auth)).status_code == 401
    admin = await headers(client)
    await client.post(f"/api/admin/users/{user['id']}/reject", headers=admin)
    assert (await client.get("/api/system/state", headers=auth)).status_code == 401


async def test_uniform_login_and_timed_lockout(env):
    app, client, _ = env
    with time_machine.travel(
        datetime(2030, 1, 1, tzinfo=timezone.utc), tick=False
    ) as clock:
        await signup(app, client)
        for email, pw in [
            ("missing@example.com", PASSWORD),
            ("worker@example.com", PASSWORD),
            ("admin@example.com", "wrong"),
        ]:
            response = await login(client, email, pw)
            assert response.status_code == 401 and response.json() == {
                "detail": LOGIN_ERROR
            }
        for _ in range(4):
            assert (await login(client, password="wrong")).status_code == 401
        # Correct password is still blocked until the fixed 15-minute window ends.
        assert (await login(client)).status_code == 401
        clock.shift(timedelta(seconds=900))
        assert (await login(client)).status_code == 200


async def test_ip_limit_cannot_be_bypassed_with_forwarded_header(env):
    app, client, _ = env
    for i in range(30):
        await login(client, f"unknown{i}@example.com", "wrong")
    result = await client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": PASSWORD},
        headers={"X-Forwarded-For": "8.8.8.8"},
    )
    assert result.status_code == 401 and result.json() == {"detail": LOGIN_ERROR}


async def test_rehash_on_login(env):
    app, client, admin = env
    old = PasswordHasher(
        time_cost=2, memory_cost=19456, parallelism=1, type=Type.ID
    ).hash(PASSWORD)
    with app.state.auth.connect(write=True) as db:
        db.execute(
            "UPDATE auth_users SET password_hash=? WHERE id=?", (old, admin["id"])
        )
    assert (await login(client)).status_code == 200
    with app.state.auth.connect() as db:
        hashed = db.execute(
            "SELECT password_hash FROM auth_users WHERE id=?", (admin["id"],)
        ).fetchone()[0]
    assert hashed != old and not app.state.auth.passwords.needs_rehash(hashed)


async def test_bootstrap_one_time_no_open_admin_signup(env):
    app, client, _ = env
    with pytest.raises(ValueError):
        app.state.auth.seed("other@example.com", "Other", PASSWORD)
    assert (await client.post("/api/auth/seed-admin", json={})).status_code == 404


async def test_last_admin_and_invalid_state_transitions(env):
    app, client, admin = env
    auth = await headers(client)
    for path, body in [
        ("role", {"role": "worker"}),
        ("status", {"status": "suspended"}),
    ]:
        assert (
            await client.patch(
                f"/api/admin/users/{admin['id']}/{path}", json=body, headers=auth
            )
        ).status_code == 409
    assert (
        await client.post(f"/api/admin/users/{admin['id']}/reject", headers=auth)
    ).status_code == 409
    user = await signup(app, client)
    assert (
        await client.patch(
            f"/api/admin/users/{user['id']}/role",
            json={"role": "sysadmin"},
            headers=auth,
        )
    ).status_code == 409


async def test_audit_append_only_and_no_credentials(env):
    app, client, _ = env
    user, worker, admin = await active(app, client)
    response = await client.get("/api/admin/audit", headers=admin)
    assert (
        PASSWORD not in response.text
        and "password_hash" not in response.text
        and "access_token" not in response.text
    )
    with app.state.auth.connect(write=True) as db:
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("DELETE FROM auth_audit")
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("UPDATE auth_audit SET action='fake'")


async def test_routes_fail_closed_and_old_recovery_removed(env):
    app, client, _ = env
    for method, path in [
        ("GET", "/api/system/state"),
        ("GET", "/api/system/relay-status"),
        ("GET", "/api/readings/history"),
        ("POST", "/api/system/start"),
        ("POST", "/api/system/stop"),
        ("POST", "/api/system/reset-cycles"),
        ("POST", "/api/system/clear-logs"),
        ("GET", "/api/admin/users"),
        ("GET", "/api/auth/me"),
        ("POST", "/api/auth/logout"),
    ]:
        assert (await client.request(method, path)).status_code == 401, path
    for path in [
        "/api/auth/otp/request",
        "/api/auth/otp/verify",
        "/api/recovery/phone",
    ]:
        assert (await client.post(path, json={})).status_code == 404
    assert not app.state.relay.is_on


async def test_duplicate_signup_uniform_and_no_extra_notifications(env):
    app, client, _ = env
    await signup(app, client)
    response = await client.post(
        "/api/auth/signup",
        json={"email": "WORKER@example.com", "name": "Other", "password": PASSWORD},
    )
    assert response.status_code == 202
    with app.state.auth.connect() as db:
        assert db.execute("SELECT count(*) FROM auth_users").fetchone()[0] == 2
        assert db.execute("SELECT count(*) FROM auth_outbox").fetchone()[0] == 1


async def test_validation_limits_cache_and_cors(env):
    _, client, _ = env
    response = await client.post(
        "/api/auth/signup", json={"email": "bad", "name": "N", "password": "secret"}
    )
    assert response.status_code == 422 and "secret" not in response.text
    response = await client.post("/api/auth/login", content=b"x" * 16385)
    assert response.status_code == 413
    response = await login(client)
    assert response.headers["cache-control"] == "no-store"
    response = await client.options(
        "/api/auth/login",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert (
        response.status_code == 400
        and "access-control-allow-origin" not in response.headers
    )


async def test_outbox_delivery_retry_and_tls(env, monkeypatch):
    app, client, _ = env
    await signup(app, client)
    from dataclasses import replace

    app.state.auth.settings = replace(
        app.state.auth.settings,
        smtp_host="smtp.example.com",
        smtp_user="sender",
        smtp_password="test-only",
        smtp_from="sender@example.com",
    )
    messages = []

    class SMTP:
        def __init__(self, host, port, timeout, context):
            assert context.check_hostname and port == 465

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def login(self, *args):
            pass

        def send_message(self, message):
            messages.append(message)

    monkeypatch.setattr("security.notifications.smtplib.SMTP_SSL", SMTP)
    assert deliver_pending(app.state.auth) == 1
    assert (
        "worker@example.com" in messages[0].get_content()
        and "Applicant" in messages[0].get_content()
    )
    assert deliver_pending(app.state.auth) == 0


async def test_outbox_failure_stays_pending(env, monkeypatch):
    app, client, _ = env
    await signup(app, client)
    from dataclasses import replace

    app.state.auth.settings = replace(
        app.state.auth.settings,
        smtp_host="smtp.example.com",
        smtp_user="sender",
        smtp_password="test-only",
        smtp_from="sender@example.com",
    )

    def fail(*a, **k):
        raise OSError("offline")

    monkeypatch.setattr("security.notifications.smtplib.SMTP_SSL", fail)
    assert deliver_pending(app.state.auth) == 0
    with app.state.auth.connect() as db:
        row = db.execute("SELECT sent_at,attempts FROM auth_outbox").fetchone()
        assert row["sent_at"] is None and row["attempts"] == 1


async def test_websocket_broadcast_checks_revocation_and_status(env):
    app, client, _ = env
    user, worker, admin = await active(app, client)
    broadcaster = Broadcaster(app.state.auth)

    class Socket:
        send_json = AsyncMock()
        close = AsyncMock()

    ws = Socket()
    broadcaster.add(ws, worker["Authorization"][7:])
    await broadcaster.broadcast({"sample": 1})
    assert ws.send_json.await_count == 1
    await client.post("/api/auth/logout", headers=worker)
    await broadcaster.broadcast({"sample": 2})
    assert ws.send_json.await_count == 1
    ws.close.assert_awaited_with(code=1008)


def test_real_websocket_requires_auth_and_closes_after_suspension(tmp_path):
    app = create_app(
        mock=True,
        db_path=str(tmp_path / "ws.db"),
        auth_settings=AuthSettings(signing_key=secrets.token_bytes(32)),
    )
    with TestClient(app) as client:
        app.state.auth.seed("admin@example.com", "Admin", PASSWORD)
        token = client.post(
            "/api/auth/login", json={"email": "admin@example.com", "password": PASSWORD}
        ).json()["access_token"]
        with client.websocket_connect("/ws") as ws:
            ws.send_text("invalid")
            assert ws.receive()["code"] == 1008
        with client.websocket_connect("/ws") as ws:
            ws.send_text("Bearer " + token)
            assert ws.receive_json()["type"] == "system_state"
            with app.state.auth.connect(write=True) as db:
                db.execute("UPDATE auth_users SET status='suspended'")
            ws.send_text("check")
            assert ws.receive()["code"] == 1008


async def test_authorization_fails_when_db_unavailable(env, monkeypatch):
    app, client, _ = env
    auth = await headers(client)

    def fail(*a, **k):
        raise sqlite3.OperationalError("unavailable")

    monkeypatch.setattr(app.state.auth, "connect", fail)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as other:
        result = await other.post("/api/system/start", headers=auth)
    assert result.status_code == 500
    assert not app.state.relay.is_on


def test_auth_configuration_has_no_default_key(monkeypatch):
    monkeypatch.delenv("AUTH_JWT_KEY", raising=False)
    with pytest.raises(ValueError):
        create_app(mock=True)
    with pytest.raises(ValueError):
        AuthSettings(signing_key=b"short")
    with pytest.raises(ValueError):
        AuthSettings(signing_key=secrets.token_bytes(32), origins=("*",))


async def test_admin_review_atomic_under_concurrency(env):
    app, client, _ = env
    user = await signup(app, client)
    auth = await headers(client)
    approved, rejected = await asyncio.gather(
        client.post(
            f"/api/admin/users/{user['id']}/approve",
            json={"role": "worker"},
            headers=auth,
        ),
        client.post(f"/api/admin/users/{user['id']}/reject", headers=auth),
    )
    assert sorted([approved.status_code, rejected.status_code]) == [200, 409]
    with app.state.auth.connect() as db:
        assert (
            db.execute(
                "SELECT count(*) FROM auth_audit WHERE target_id=? AND action IN ('approve','reject')",
                (user["id"],),
            ).fetchone()[0]
            == 1
        )


async def test_approval_rolls_back_if_audit_fails(env, monkeypatch):
    app, client, _ = env
    user = await signup(app, client)
    auth = await headers(client)

    def fail(*a):
        raise sqlite3.OperationalError("disk error")

    monkeypatch.setattr(app.state.auth, "audit", fail)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as other:
        result = await other.post(
            f"/api/admin/users/{user['id']}/approve",
            json={"role": "sysadmin"},
            headers=auth,
        )
    assert result.status_code == 500
    with app.state.auth.connect() as db:
        row = db.execute(
            "SELECT status,role FROM auth_users WHERE id=?", (user["id"],)
        ).fetchone()
        assert row["status"] == "pending" and row["role"] is None


async def test_worker_can_operate_mock_controller(env):
    app, client, _ = env
    _, worker, _ = await active(app, client)
    assert (await client.post("/api/system/start", headers=worker)).status_code == 200
    assert app.state.relay.is_on
    assert (
        await client.get("/api/readings/history", headers=worker)
    ).status_code == 200
    assert (await client.post("/api/system/stop", headers=worker)).status_code == 200
    assert not app.state.relay.is_on


async def test_hashing_capacity_limit_and_private_database(env):
    app, client, _ = env
    import stat
    from pathlib import Path

    assert stat.S_IMODE(Path(app.state.auth.db_path).stat().st_mode) == 0o600
    slots = app.state.auth.passwords.slots
    slots.acquire()
    slots.acquire()
    try:
        result = await login(client)
        assert result.status_code == 503
    finally:
        slots.release()
        slots.release()
