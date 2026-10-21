# Verification results

Run date: 2026-10-21. Python 3.12.15 on the development Linux x86_64 workstation. API tests used disposable SQLite databases, random test signing keys and mock hardware. No production account, mail recipient or physical controller was exercised.

| Check | Version / scope | Result | Exit | Output |
|---|---|---|---|---|
| pytest + HTTPX + time-machine | pytest 9.1.1; HTTPX 0.28.1; time-machine 3.5.1 | **42 passed**, 1 deprecation warning, 12.79 seconds | 0 | [pytest.txt](pytest.txt) |
| Bandit | 1.9.4; recursive backend, excludes tests | **1 low**, 0 medium/high; reviewed harness import described below | 1 (finding retained) | [bandit.json](bandit.json), [stderr](bandit.txt) |
| Semgrep | 1.182.0; p/security-audit, p/python, p/typescript | **0 findings**, 0 errors; 288 rules, 191 targets | 0 | [semgrep.json](semgrep.json), [summary](semgrep.txt) |
| pip-audit | 2.10.1; requirements-hardware.txt includes runtime requirements | **0 known vulnerabilities**, 45 resolved Python dependencies | 0 | [pip-audit.json](pip-audit.json), [summary](pip-audit.txt) |
| Schemathesis anonymous | 4.32.3; 18/18 operations | **666 generated/passed**; 2 warnings | 0 | [anonymous output](schemathesis-anonymous.txt) |
| Schemathesis authenticated | 4.32.3; 17/18 operations, logout excluded | **489 generated/passed**, 24 skipped; 3 warnings | 0 | [authenticated output](schemathesis-authenticated.txt) |
| TypeScript | Project compiler, `tsc --noEmit --incremental false` | Passed; no diagnostics | 0 | [typescript.txt](typescript.txt) (empty on success) |
| Chromium/Playwright | Real browser against disposable mock API | Signup → pending denial → admin approval/audit → logout → worker login passed; no browser errors or JWT in localStorage | 0 | [browser.txt](browser.txt) |
| Argon2 benchmark | argon2-cffi 25.1.0; seven serial and eight concurrent checks per profile | Selected 64 MiB/t=3/p=4: **72.43 ms median**, 74.28 ms median with two concurrent checks | 0 | [argon2-benchmark.json](argon2-benchmark.json) |

The full generated [OpenAPI schema](openapi.json), [schema-server log](schemathesis-server.txt) and [schema exit codes](schemathesis-exit-codes.json) are included. Reproduction commands are in [../README.md](../README.md#verification-commands). The benchmark is a development-host measurement; it does not establish acceptable latency or memory headroom on the Raspberry Pi.

## Findings, changes and retained limitations

**Bandit:** the final B404 at `backend/security/verify_schema.py:9` flags importing `subprocess`. This is a local verification harness that launches the installed Python/uvicorn and Schemathesis executables with fixed argument arrays, no shell, and no HTTP-controlled command values. Retained as a reviewed low finding rather than claiming a clean Bandit exit. The B603 suppressions at its two process calls have that same documented rationale.

[Initial Bandit JSON](bandit-initial.json) preserves five earlier findings. B104 was corrected by making the CLI default bind address loopback. B105 in the benchmark was corrected by generating a random benchmark password. The `bearer` token-type protocol string (B105) and two mock sensor noise generators (B311) have narrow inline suppressions explaining that they are not credentials or security randomness. No authentication randomness uses Python's `random` module. [Initial stderr](bandit-initial.txt) is also retained.

**Semgrep:** scanned `backend`, `lib`, `app`, `components`, excluding backend tests. Its JSON confirms the newly created `backend/security/service.py`, `lib/auth-context.tsx` and verification harness were scanned, despite its generic “limited to files tracked by git” summary. No scan parse errors were reported. Registry rules are an external snapshot, not a proof that all vulnerabilities are absent.

**pip-audit:** covers resolved Python runtime/hardware dependencies, including transitive dependencies. It does not cover npm, firmware, OS packages or the separate security-tool environment. Zero known advisories is a point-in-time result.

**Schemathesis:** initial runs discovered undocumented HTTP 400 responses for malformed requests. Those responses were added to OpenAPI and both runs passed afterward. The original [anonymous](schemathesis-anonymous-initial.txt) and [authenticated](schemathesis-authenticated-initial.txt) failures are preserved. Final generation uses seed 9106 and 20 examples per operation, coverage/fuzzing, and six checks: server errors, status conformance, response schema, content type, negative-data rejection and ignored authentication. There are no explicit examples in the schema; the examples phase skips. Stateful generation is disabled.

The anonymous 401/403 warnings are expected for protected operations. Generated emails can pass broad JSON-schema `format: email` generation but fail email-validator, so those warnings remain. The authenticated run reports random missing user IDs (404) and a status-operation authorization warning after generated role changes. These limit how deeply generated cases exercise lifecycle operations; the dedicated HTTPX tests use valid users and deliberately exercise review races, role changes, lockout, denial and revocation. Authenticated schema generation excludes logout to preserve its shared token; the dedicated time-machine logout/reuse test covers it. These exclusions and warnings are not represented as full API behavioral coverage.

**pytest:** the one warning is Starlette's deprecation of HTTPX in its synchronous TestClient, used for the real WebSocket test. HTTP lifecycle tests use HTTPX AsyncClient/ASGITransport. All tests pass; no warning was hidden.

**Browser:** exercised actual login/signup and Account review screens with a short-lived backend on loopback port 8766. Test credentials were generated for that database and the credential file was removed when the server stopped. Backend and frontend source use no persistent JWT storage. Browser checks do not constitute an XSS audit.

## Not verified / not deployed

Real SMTP delivery, production HTTPS/WSS, production bootstrap/migration, target-Pi performance and hardware-network isolation remain operator tasks. The FastAPI rebuild does **not** secure independent firmware/Shelly endpoints. Password change/recovery, MFA, breached-password screening, permanent per-user all-session revocation and off-host security logs are not implemented. These and other gaps are explicitly mapped in [../ASVS.md](../ASVS.md).
