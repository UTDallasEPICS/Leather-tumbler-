# Requirement and ASVS 5.0 mapping

Scope: the FastAPI API and its Next.js client, in the mock-hardware test environment. This is a targeted implementation checklist, **not full ASVS certification**. IDs refer to the [official ASVS 5.0.0 release](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en). “Implemented/tested” describes this code and the saved results; it does not assert that production configuration has been applied.

All named pytest cases are in [backend/tests/test_auth.py](../../backend/tests/test_auth.py); fixtures use HTTPX and time-machine. [Raw results and limitations](reports/RESULTS.md) are part of this checklist.

## Requested requirements

| Requirement | ASVS controls | Implementation | Verification | Status |
|---|---|---|---|---|
| Read actual auth paths/schema before changing | 6.1.3, 8.1.1 | [Pre-change inventory with original file/line references](AUDIT.md); baseline commit recorded | Source inspection; no deployed DB file was available | Complete for repository; deployed schema unverified |
| STRIDE and explicit design choices | 6.1.1, 8.1.1–2 | [Design and trust boundaries](DESIGN.md) | Threat-to-defense table and residual risks | Complete |
| Argon2id, benchmark, rehash on successful login | 11.4.2 | [passwords.py](../../backend/security/passwords.py) `Passwords`, [service.py](../../backend/security/service.py) `login`; RFC 9106 64 MiB/t=3/p=4 | `test_rehash_on_login`, `test_pending_no_role_and_notification_contains_name_email`; [benchmark](reports/argon2-benchmark.json) | Implemented/tested; deployment-Pi benchmark pending |
| JWT pinned algorithm, exp=30 min, iat/jti/iss/aud | 9.1.1–3, 9.2.1–4, 7.3.2 | `service.py:143` `login`, `:207` `authenticate`; fixed HS256 and at+jwt, required key/claims | `test_expiry_exactly_30_minutes_and_claims`, `test_token_attacks`, `test_auth_configuration_has_no_default_key` | Implemented/tested |
| Logout denylist, remaining-life TTL, protected-request check | 7.2.1, 7.4.1 | `service.py:264` `logout`, `:207` `authenticate`; [schema.sql](../../backend/security/schema.sql) `auth_denylist` | `test_logout_denylist_ttl_and_reuse_across_service_restart` checks exp-derived TTL and restart persistence | Implemented/tested; expiry is logical, cleanup is lazy |
| Signup pending with no role | 8.2.3, 8.3.1 | `service.py:113` `signup`, schema CHECK constraints; [strict DTOs](../../backend/schemas/auth.py) | `test_pending_no_role_and_notification_contains_name_email`, `test_signup_mass_assignment_rejected` | Implemented/tested |
| Notify admin with applicant email and name | 8.1.1 (documented workflow) | Signup transaction queues [SMTP outbox](../../backend/security/notifications.py); TLS/authentication required | `test_pending_no_role_and_notification_contains_name_email`, `test_outbox_delivery_retry_and_tls`, `test_outbox_failure_stays_pending` | Code and mock tests complete; **real delivery unverified, SMTP configuration required** |
| Admin approves worker/sysadmin or rejects | 8.2.1–3, 8.3.1 | [admin routes](../../backend/routers/auth.py), `service.py:291` `change_user`; [Account UI](../../components/account-view.tsx) | `test_rejected_user_blocked_and_audited`, `test_worker_cannot_approve_escalate_or_read_audit`, `test_admin_review_atomic_under_concurrency`, browser signup/approval flow | Implemented/tested |
| Only active accounts can log in/use protected routes | 7.2.1, 8.3.1 | `login`, `authenticate`, [central dependencies](../../backend/security/dependencies.py), [router protection](../../backend/app.py), [WebSocket auth](../../backend/routers/ws.py) | `test_nonactive_even_validly_signed_token_blocked`, pending/rejected tests, `test_routes_fail_closed_and_old_recovery_removed`, real WebSocket test | Implemented/tested within FastAPI; independent firmware API remains outside this boundary |
| Roles/status read from DB on every request; immediate demotion/suspension | 8.3.2 | `authenticate`; admin transactions reauthorize; [broadcast rechecks](../../backend/services/broadcast.py) | `test_demotion_mid_session_and_audit`, `test_suspension_mid_session`, `test_websocket_broadcast_checks_revocation_and_status`, `test_authorization_fails_when_db_unavailable` | Implemented/tested at next authorization decision; already-running actions are not undone |
| Audit approvals, rejections and role changes | 16.2.1–2, 16.2.5, 16.4.1 | `service.py:81` `audit`, `change_user`, append-only SQL triggers, sysadmin-only audit API | Rejection/demotion tests; `test_audit_append_only_and_no_credentials`, `test_approval_rolls_back_if_audit_fails` | Implemented/tested; host administrators can bypass DB triggers |
| One-time first-admin seed; no public admin signup | 6.3.2, 8.3.1 | [auth_cli.py](../../backend/auth_cli.py) `seed-admin`, `service.py:87` `seed`, singleton marker | `test_bootstrap_one_time_no_open_admin_signup`, mass-assignment and last-admin tests | Implemented/tested; production seed not run |
| Uniform login errors, rate limit and lockout | 6.1.1, 6.3.1; partial 6.3.8 | `consume_limit`, `login`, dummy hash; persistent IP/account windows; no forwarded-header trust | `test_uniform_login_and_timed_lockout`, `test_ip_limit_cannot_be_bypassed_with_forwarded_header`, hashing-capacity test | Implemented/tested; no formal timing equivalence claim; targeted lockout remains possible |
| 30-minute expiry test with controlled clock | 9.2.1, 7.3.2 | Exact 1800 seconds and zero leeway | `test_expiry_exactly_30_minutes_and_claims`: accepted at 1799s, refused at 1800s | Passed |
| Logout then reuse test | 7.4.1 | Persistent jti revocation | `test_logout_denylist_ttl_and_reuse_across_service_restart` | Passed |
| Pending/rejected access tests | 8.3.1 | DB status check on login and protected access | Pending/rejected cases plus `test_nonactive_even_validly_signed_token_blocked` | Passed |
| Role escalation test | 8.2.1, 8.2.3 | Strict signup schema and server-side role authorization | Mass-assignment, worker escalation, signed extra role-claim tests | Passed |
| Tampered and alg:none token tests | 9.1.1–3 | Exact header/algorithm and signature checks | `test_token_attacks` (12 parametrized attacks) | Passed |
| Demotion mid-session test | 8.3.2 | Current DB role replaces token assertions | `test_demotion_mid_session_and_audit`: same token loses admin permissions | Passed |
| Bandit, Semgrep, pip-audit, Schemathesis outputs | Verification evidence, not independent ASVS compliance | [Saved reports](reports/RESULTS.md) and [reproduction commands](README.md#verification-commands) | Tool executions and documented warnings/findings | Run; one reviewed low Bandit finding retained |

## Additional controls and explicit gaps

| ASVS controls | Status and evidence / limitation |
|---|---|
| 6.2.1, 6.2.5–10 | Password policy allows 15–128 Unicode characters, no composition/rotation rules, no password normalization/truncation; masked inputs support paste/password managers. DTO/source review and validation/browser checks; not exhaustive browser-assistive-technology testing. |
| 6.2.2–4, 6.2.11–12, 6.4.3 | **Unmet:** password change, recovery, common/context-specific/breached-password screening. No unsafe fallback or mock recovery remains. |
| 6.3.3 | **Unmet:** MFA. |
| 6.3.4 | FastAPI paths use centralized controls; **not met across independently reachable legacy ESP32/Shelly endpoints**. Network isolation or separate firmware hardening is required. |
| 6.3.8 | Uniform credential/status/lockout error body and status; dummy Argon2 verification for nonexistent users. **Partial:** malformed requests return validation errors, saturation returns 503, and timing equivalence has not been formally analyzed. |
| 7.2.2 | Tokens generated dynamically with fresh random UUID jti and cryptographic MAC. UUID jti is a collision-resistant identifier (122 random bits), not the bearer-secret strength claim. Signing keys require at least 256 bits. |
| 7.2.4, 7.3.1, 7.4.3, 7.5.2 | **Unmet/partial:** parallel sessions remain valid; no inactivity timeout, credential-change session revocation, or session listing/management. Absolute 30-minute expiry is implemented. |
| 7.4.2, 7.4.5 | **Partial:** suspension blocks every current session immediately, but reactivation can restore an otherwise unexpired, unrevoked token. There is no permanent per-user “revoke every session” API. Key rotation invalidates all users' tokens. |
| 8.1.1–2, 8.2.1–3 | Documented one-controller scope: workers share operational data/control; sysadmins alone manage accounts, audit and reading deletion. No per-user/per-tumbler tenancy claim. Strict role/status inputs reject assignment through signup. |
| 11.2.1, 11.4.2 | Maintained PyJWT/argon2-cffi libraries; RFC 9106 profile and measured development-host timings. **Target hardware performance unverified.** |
| V12 secure communication | **Deployment incomplete:** HTTPS/WSS termination, trusted proxy configuration, firewall boundaries and protected backups must be applied by the operator. SMTP code uses verified TLS; no real provider was configured. |
| 16.3.1–2 | **Unmet:** comprehensive security logging of login events and denied authorization decisions. Existing HTTP access logs are not a substitute. Requested account review/role/status audit is implemented. |
| 16.4.2–3 | **Partial/unmet:** append-only database triggers resist ordinary application modification; no off-host immutable security-log export. Host/DB compromise can remove triggers or alter files. |
| Operational verification | **Unverified:** production mail delivery, production database migration, live hardware integration, production bootstrap, real TLS deployment, dependency audit of firmware/npm/OS packages. No production credentials or devices were used. |

The SQLite denylist/outbox choice and alternatives (Redis/PostgreSQL, transactional mail API), memory token storage versus secure cookies, and symmetric versus asymmetric JWT choices are documented in [DESIGN.md](DESIGN.md).
