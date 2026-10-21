import secrets
import httpx
import pytest_asyncio
from asgi_lifespan import LifespanManager
from app import create_app
from security.config import AuthSettings

PASSWORD = "correct horse battery staple!"


@pytest_asyncio.fixture
async def env(tmp_path):
    settings = AuthSettings(signing_key=secrets.token_bytes(32))
    app = create_app(
        mock=True, db_path=str(tmp_path / "test.db"), auth_settings=settings
    )
    async with LifespanManager(app):
        admin = app.state.auth.seed("admin@example.com", "First Admin", PASSWORD)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield app, client, admin


async def login(client, email="admin@example.com", password=PASSWORD):
    return await client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )


async def headers(client, email="admin@example.com"):
    result = await login(client, email)
    assert result.status_code == 200, result.text
    return {"Authorization": "Bearer " + result.json()["access_token"]}


async def signup(app, client, email="worker@example.com"):
    response = await client.post(
        "/api/auth/signup",
        json={"email": email, "name": "Applicant", "password": PASSWORD},
    )
    assert response.status_code == 202, response.text
    with app.state.auth.connect() as db:
        return dict(
            db.execute("SELECT * FROM auth_users WHERE email=?", (email,)).fetchone()
        )


async def active(app, client, role="worker", email="worker@example.com"):
    user = await signup(app, client, email)
    auth = await headers(client)
    response = await client.post(
        f"/api/admin/users/{user['id']}/approve", json={"role": role}, headers=auth
    )
    assert response.status_code == 200, response.text
    return user, await headers(client, email), auth
