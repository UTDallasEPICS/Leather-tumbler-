import secrets

import httpx
import pytest_asyncio
from asgi_lifespan import LifespanManager

from app import create_app
from security.config import AuthSettings


@pytest_asyncio.fixture
async def site(tmp_path):
    out = tmp_path / "out"
    (out / "_next" / "static").mkdir(parents=True)
    (out / "index.html").write_text("home")
    (out / "run.html").write_text("run page")
    (out / "run.txt").write_text("rsc payload")
    (out / "404.html").write_text("not found page")
    (out / "_next" / "static" / "app.js").write_text("js")
    (tmp_path / "secret.txt").write_text("outside")
    app = create_app(
        mock=True,
        db_path=str(tmp_path / "test.db"),
        auth_settings=AuthSettings(signing_key=secrets.token_bytes(32)),
        web_dir=str(out),
    )
    async with LifespanManager(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield client


async def test_pages_resolve_like_next_export(site):
    assert (await site.get("/")).text == "home"
    assert (await site.get("/run")).text == "run page"
    assert (await site.get("/run/")).text == "run page"
    assert (await site.get("/run.txt")).text == "rsc payload"
    assert (await site.get("/_next/static/app.js")).text == "js"


async def test_unknown_page_is_404_page(site):
    response = await site.get("/nope")
    assert response.status_code == 404
    assert response.text == "not found page"


async def test_api_routes_still_win_and_need_auth(site):
    assert (await site.get("/api/auth/me")).status_code == 401
    assert (await site.get("/health")).json() == {"status": "ok"}


async def test_no_escape_from_web_dir(site):
    for path in ("/../secret.txt", "/..%2Fsecret.txt", "/%2e%2e/secret.txt"):
        response = await site.get(path)
        assert "outside" not in response.text


async def test_site_not_served_without_web_dir(tmp_path):
    app = create_app(
        mock=True,
        db_path=str(tmp_path / "test.db"),
        auth_settings=AuthSettings(signing_key=secrets.token_bytes(32)),
    )
    async with LifespanManager(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            assert (await client.get("/")).status_code == 404
