# Authentication delivery and verification

Read [the pre-change audit](AUDIT.md), [STRIDE/design choices](DESIGN.md), and [the requirement-to-code/test checklist](ASVS.md). Raw tool output is in [reports](reports/). This is an implementation review, not an ASVS certification or a claim of production deployment.

## Configure and bootstrap

Requires Python 3.12+ and a persistent private SQLite database. Do not use the development test credentials/database for a deployment.

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
# On the Raspberry Pi, use requirements-hardware.txt instead.
umask 077
python -c 'import base64,secrets; print("AUTH_JWT_KEY=" + base64.b64encode(secrets.token_bytes(32)).decode())' > .env.auth
```

Add these values to `.env.auth` (the key above must be kept secret and backed up securely):

```dotenv
AUTH_ISSUER=dava-auth
AUTH_AUDIENCE=dava-api
AUTH_ORIGINS=https://your-dava-site.example
# Include localhost origins explicitly for local development.
# All five SMTP settings are required together; otherwise leave them all unset.
AUTH_SMTP_HOST=smtp.your-provider.example
AUTH_SMTP_PORT=465
AUTH_SMTP_USER=your-smtp-account
AUTH_SMTP_PASSWORD=your-smtp-secret
AUTH_SMTP_FROM=dava@your-domain.example
```

Load the environment and run the **one-time** seed command. It prompts for the admin password without echo or command-line exposure; use your real administrator email, since signup notices are sent there.

```bash
set -a
. ./.env.auth
set +a
python auth_cli.py seed-admin --db sensorhub.db --email admin@your-domain.example --name 'Administrator'
python main.py --mock --host 127.0.0.1 --port 8765 --db sensorhub.db
```

For real hardware, omit `--mock` and supply the controller config. `--mock` now always forces the relay mock even if a Shelly address is configured. Do not expose a development HTTP listener to the workshop LAN. Terminate HTTPS/WSS at a reverse proxy; keep the backend loopback-only, configure explicit origins, and restrict network access to Shelly/ESP32. `setup.sh` now uses `.env.auth` in systemd and UMask=0077; it does not invent an admin account or secret when that file is absent.

The frontend's sign-in page has **Server connection** for choosing the API origin. HTTP is allowed only for loopback development. The old `0000` PIN no longer grants access. Signup accepts name/email/password only. New users must wait for review under the sysadmin's **Account** page. SMTP notices contain the submitted name and email; their validity is for the administrator to establish. Tokens stay in browser memory; reload requires login.

Outbox delivery runs every 30 seconds when SMTP is configured. An operator can retry it manually:

```bash
python auth_cli.py deliver-notifications --db sensorhub.db
```

The implementation has been tested with a fake SMTP server interface, **not** with real mail delivery. With SMTP unset, requests remain durably queued and sysadmins can review the in-app list. Monitor pending/failed delivery rather than assuming a queued message was delivered.

## Operational rules and migration

- Stop old backend processes before migration; an older process could still serve unprotected endpoints. Back up the database and use the same file for seed and server.
- Existing reading tables/data are preserved. New `auth_*` tables are additive. Existing obsolete `otp_codes` / `recovery_config` tables, if present, are not migrated into user credentials or used by the new service; dispose of old OTP/phone data under an approved retention plan.
- No legacy PIN is imported as a password. No old session remains valid because there was no prior server session model.
- A valid environment key is mandatory even for mock hardware. The key is never embedded in the frontend. Rotation invalidates all current tokens and resets keyed rate-limit identities; coordinate maintenance and restart every API process together.
- Back up users, audit, bootstrap marker, rate state and denylist together. Restoring an old snapshot can resurrect revoked tokens; rotate the signing key on disaster recovery.
- Database files use 0600; protect their containing directory and backups. Audit rows cannot be updated/deleted via normal SQL triggers, but a host/DB administrator can remove those protections. Export audit evidence off-host before claiming tamper resistance against host compromise.
- Worker: read/control the shared machine, read logs. Sysadmin: those capabilities plus user administration, audit access and clearing readings. No multi-tenant/per-tumbler ownership model is claimed.
- The old public push relay returns 410. Local notification behavior remains; remote push must be rebuilt around authenticated server-owned device registrations before re-enabling it.
- Frontend direct-Shelly fallback is disabled. ESP32 firmware still has its independent legacy endpoints and is **not secured by this FastAPI change**. Do not permit clients to bypass FastAPI by reaching it directly.
- The old mock password/PIN recovery path is removed. Password changes, recovery, MFA, common/breached-password screening and concurrent-session management are listed as unmet ASVS controls, not silently represented as implemented.

## Verification commands

Runtime versions are pinned in `backend/requirements.txt`; testing tool versions are pinned in `backend/requirements-dev.txt`. The run used Python 3.12.15. Semgrep was installed separately (version recorded in its report) to avoid mixing its dependency requirements with the application.

From the repository root:

```bash
python -m pip install -r backend/requirements-dev.txt
python -m pytest -c backend/pytest.ini backend/tests/test_auth.py -q
python backend/security/benchmark.py
bandit -r backend -x backend/tests -f json -o docs/security/reports/bandit.json
semgrep scan --config p/security-audit --config p/python --config p/typescript \
  --metrics off --disable-version-check --exclude backend/tests \
  --json --output docs/security/reports/semgrep.json backend lib app components
pip-audit -r backend/requirements-hardware.txt --format json \
  --output docs/security/reports/pip-audit.json
PYTHONPATH=backend python backend/security/verify_schema.py
npx tsc --noEmit --incremental false
```

`verify_schema.py` creates a disposable local database and random test credentials, binds a loopback-only API on a free port with mock hardware, saves its generated OpenAPI schema, runs anonymous and authenticated checks, redacts the test token, then terminates the server and deletes the database. No real controller is exercised. The authenticated schema pass excludes logout, whose revocation would invalidate the shared test token; dedicated HTTPX/time-machine tests cover logout and subsequent reuse.

The saved schema runs use seed 9106, coverage and fuzzing phases, 20 examples per operation and the checks `not_a_server_error`, `status_code_conformance`, `response_schema_conformance`, `content_type_conformance`, `negative_data_rejection`, `ignored_auth`. Stateful generation is disabled. Initial outputs record the discovered undocumented 400 malformed-body response; final outputs follow the OpenAPI correction. Warnings about anonymous 401s, generated email-validation failures, random nonexistent user IDs, and changed-role authorization are retained. A passing schema run is not a replacement for the explicit lifecycle tests.

Browser verification used Chromium/Playwright against `tests/browser_server.py`, a disposable backend on port 8766. The output records signup, pending-login denial, admin approval, audit UI, logout, worker login, and absence of persistent JWT storage. The test server's temporary credentials were removed at shutdown.

See [reports/RESULTS.md](reports/RESULTS.md) for final counts, limitations, initial findings, suppressions and exit codes.
