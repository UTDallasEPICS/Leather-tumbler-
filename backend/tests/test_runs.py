"""The shared runs API (contract at the top of lib/runs-api.ts), behind the signed-in session."""

from tests.conftest import headers


def run(run_id, tumbler=1, status="active", **extra):
    return {"id": run_id, "tumblerId": tumbler, "status": status, "stageId": "soaking", "startedAt": 1000, **extra}


async def test_runs_need_a_session(env):
    _, client, _ = env
    assert (await client.get("/api/runs")).status_code == 401
    assert (await client.post("/api/runs", json={"run": run("r1")})).status_code == 401
    assert (await client.put("/api/runs/r1", json={"run": run("r1"), "baseRev": 1})).status_code == 401


async def test_one_active_run_per_tumbler_and_server_owned_fields(env):
    _, client, _ = env
    auth = await headers(client)
    created = await client.post("/api/runs", json={"run": run("r1", rev=99, sensors={"x": 1})}, headers=auth)
    assert created.status_code == 201
    doc = created.json()["run"]
    assert (doc["rev"], doc["sensors"]) == (1, {})
    assert "serverNow" in created.json()

    clash = await client.post("/api/runs", json={"run": run("r2")}, headers=auth)
    assert clash.status_code == 409 and clash.json()["error"] == "active_run"
    assert clash.json()["run"]["id"] == "r1"
    again = await client.post("/api/runs", json={"run": run("r1", tumbler=2)}, headers=auth)
    assert again.json()["error"] == "exists"
    bad = await client.post("/api/runs", json={"run": run("not ok")}, headers=auth)
    assert bad.status_code == 400


async def test_saves_need_the_current_rev_and_finished_runs_are_final(env):
    _, client, _ = env
    auth = await headers(client)
    await client.post("/api/runs", json={"run": run("r1")}, headers=auth)

    saved = await client.put("/api/runs/r1", json={"run": run("r1", stageId="liming"), "baseRev": 1}, headers=auth)
    assert saved.status_code == 200 and saved.json()["run"]["rev"] == 2
    stale = await client.put("/api/runs/r1", json={"run": run("r1"), "baseRev": 1}, headers=auth)
    assert stale.status_code == 409 and stale.json()["error"] == "stale"
    assert stale.json()["run"]["stageId"] == "liming"

    over = await client.post("/api/runs/r1/override", json={"reason": "Forgot to log"}, headers=auth)
    assert over.json()["run"]["status"] == "overridden"
    final = await client.put("/api/runs/r1", json={"run": run("r1"), "baseRev": 3}, headers=auth)
    assert final.status_code == 409 and final.json()["error"] == "final"
    missing = await client.put("/api/runs/zz", json={"run": run("zz"), "baseRev": 1}, headers=auth)
    assert missing.status_code == 404


async def test_import_skips_known_runs_and_keeps_a_clash_as_overridden(env):
    _, client, _ = env
    auth = await headers(client)
    await client.post("/api/runs", json={"run": run("r1")}, headers=auth)
    sensors = {"soaking": {"temp": {"n": 1, "sum": 20, "sumSq": 400, "min": 20, "max": 20}}}
    result = await client.post(
        "/api/runs/import",
        json={"runs": [run("r1"), run("old1", status="completed", endedAt=2000, sensors=sensors), run("old2")]},
        headers=auth,
    )
    assert result.status_code == 200
    assert (result.json()["imported"], result.json()["skipped"]) == (["old1", "old2"], ["r1"])

    page = (await client.get("/api/runs?since=0", headers=auth)).json()
    by_id = {r["id"]: r for r in page["runs"]}
    assert by_id["old1"]["sensors"] == sensors
    assert by_id["old2"]["status"] == "overridden"


async def test_changes_are_listed_oldest_first_in_pages(env):
    _, client, _ = env
    auth = await headers(client)
    for i in range(3):
        await client.post("/api/runs", json={"run": run(f"r{i}", tumbler=i + 1)}, headers=auth)

    first = (await client.get("/api/runs?since=0&limit=2", headers=auth)).json()
    assert [r["id"] for r in first["runs"]] == ["r0", "r1"] and first["more"]
    rest = (await client.get(f"/api/runs?since={first['seq']}&limit=2", headers=auth)).json()
    assert [r["id"] for r in rest["runs"]] == ["r2"] and not rest["more"]


async def test_system_info_names_the_controller(env):
    _, client, _ = env
    info = (await client.get("/api/system/info", headers=await headers(client))).json()
    assert info["controllerId"].startswith("py-")
