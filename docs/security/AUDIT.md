# Authentication audit — before implementation

Baseline: `fc71bd8faee3724936ce28f9c2837795af4a5a9c`. These findings were reported in the conversation before source changes. Line numbers below refer to that baseline, not the rewritten files. Inspect the original with `git show fc71bd8:PATH | nl -ba`.

## Inspected schema

Read `backend/db.py:14–49`, `142–181` directly. The checkout had no `backend/sensorhub.db`; only WAL/SHM remnants were present. No deployed database contents are claimed to have been inspected. Schema creation SQL defined:

| Table | Columns / constraints | Authentication consequence |
|---|---|---|
| readings | id, temperature, timestamp | No owner or access policy |
| ph_readings | id, ph, timestamp | No owner or access policy |
| system_state | singleton id=1, active, cycles | Shared controller state |
| recovery_config | singleton id=1, phone plaintext | One globally replaceable recovery destination |
| otp_codes | id, phone, code plaintext, expires_at, consumed, created_at | No user association, attempt counter, keyed hash, or atomic consume |

There were **no user, credential-hash, role, approval, session, revocation, lockout, or security-audit tables**. Search of backend, frontend, firmware, and Android sources found no server password-login/signup implementation or role check. Firebase messaging registration is not Firebase Authentication; README claims about Firebase login did not match the implementation.

## Complete identity / credential / token surface inventory

| Surface | Actual files and original lines | Behavior |
|---|---|---|
| PIN creation/storage/comparison | `lib/pin-auth.ts:3–28` | Fixed default `0000`; localStorage; four digits; plaintext comparison |
| Login gate / reset UI | `components/dashboard-shell.tsx:12–115, 133–231, 241–253` | Local state unlock; local mock OTP fallback; no server session |
| Change PIN | `components/account-view.tsx:46–73, 140–211` | Compares and overwrites local PIN |
| Recovery number UI | `components/account-view.tsx:28–44, 76–98, 108–137` | Fetches/replaces global recovery number |
| API auth/recovery client | `lib/api.ts:65–82, 118–140` | No Authorization header; OTP request/verify helpers; only 5xx treated as errors |
| OTP routes and DTOs | `backend/routers/auth.py:32–105`; `backend/schemas/auth.py:1–22` | Request/verify without caller identity; `debugCode` exposed |
| OTP generation / SMS | `backend/services/otp.py:8–40`; `backend/services/phone.py:1–44` | Random code; mock default; Twilio basic auth; phone normalization/matching |
| Recovery routes | `backend/routers/recovery.py:15–40`; `backend/schemas/recovery.py:1–16` | Public read/update of shared number |
| OTP persistence | `backend/db.py:33–45, 129–181` | Plain codes; read then update consumption |
| Global wiring | `backend/app.py:41–49, 90–102`; `backend/deps.py:11–24` | No authentication dependency; wildcard CORS |
| Controller commands | `backend/routers/system.py:28–88` | Public state/start/stop/reset/clear/status |
| History and streams | `backend/routers/readings.py:13–20`; `backend/routers/ws.py:20–39`; `backend/services/broadcast.py:23–33` | Public data; no stream revalidation |
| Transport / bypass | `lib/settings.ts:46–58`; `lib/dashboard-context.tsx:497–515, 569–655` | HTTP/WS; direct unauthenticated Shelly fallback |
| Push registration tokens | `lib/push-notifications.ts:26–34`; `lib/dashboard-context.tsx:237–240, 277–288`; `components/settings-view.tsx:27–42, 84–100` | FCM destination stored in localStorage and printed; never an access token |
| Privileged push relay | `app/api/send-fcm/route.ts:5–12, 16–51`; `lib/push-api.ts:9–25` | Server credentials send arbitrary caller-selected notifications; no auth |
| Firmware identity/OTP routes | `firmware/src/net/ApiServer.cpp:72–101, 139–189, 282–369` | Public control, WS, recovery and OTP; debug codes |
| Firmware OTP/SMS | `firmware/src/services/OtpService.cpp:25–65, 75–83`; `OtpService.h:1–36` | RAM codes, no attempt cap; TLS verification off |
| Firmware network secrets | `firmware/src/core/Config.h:10–16, 46–52`; `Config.cpp:41–62, 81–101`; `firmware/src/net/ConfigPortal.cpp:81–108, 127–132` | Wi-Fi/Twilio secrets in NVS; fixed AP passwords; unauthenticated portal save |
| Android | `android/app/google-services.json` | Firebase project/client configuration; empty OAuth client lists. No Android-side user authentication implementation found |
| Bootstrap / deployment | `backend/main.py:31–42`; `backend/setup.sh:110–123, 215–238` | Public interface by default; no first-admin process or auth-secret provisioning |

## Findings and concrete abuse paths

1. **Critical — client-only authentication.** `lib/pin-auth.ts:13–28` and `components/dashboard-shell.tsx:245–253`: edit `dava_app_pin` in localStorage or call the API directly. The default PIN is four known digits. No password hashing or server-verifiable credential exists.
2. **Critical — unauthenticated machine control.** `backend/routers/system.py:34–81` and `backend/app.py:98–102`: arbitrary callers can start/stop the relay, reset cycles and delete readings. No role/status check is available anywhere in the dependency chain.
3. **High — unauthenticated data and persistent streams.** `backend/routers/readings.py:13–20`, `backend/routers/ws.py:26–35`, `backend/services/broadcast.py:23–33`: anyone can read measurements and subscribe indefinitely. There is no logout, expiry, or revocation enforcement.
4. **Critical — self-issued recovery.** `components/dashboard-shell.tsx:58–61, 87–108`: an unavailable backend causes a code to be generated and displayed locally, then permits changing the local PIN. Server OTP verification is not bound to a reset authorization or a user.
5. **High — recovery destination takeover and disclosure.** `backend/routers/recovery.py:15–40`: anyone can fetch and replace the singleton recovery phone before requesting an OTP.
6. **High — exposed and weakly generated OTPs.** `backend/services/otp.py:14, 38–40`, `backend/routers/auth.py:58–80`: mock mode is the default, codes are returned/logged, and `random.randrange` is inappropriate for authentication secrets.
7. **High — plaintext OTP storage and concurrent reuse.** `backend/db.py:38–44, 151–171`: a DB reader obtains unexpired codes; two callers may both select an unused code before either marks it consumed. Expiry alone does not prevent brute force; no attempt budget exists.
8. **Medium — recovery enumeration and unlimited requests.** `backend/routers/auth.py:38–47, 84–105`: distinguishable registration responses disclose account configuration; requests/verifications are not throttled. SMS spend and guessing are unconstrained.
9. **High — public privileged push service.** `app/api/send-fcm/route.ts:16–43`: attacker-selected tokens/messages reach Firebase using server credentials. `:51` additionally exposes exception strings. FCM tokens logged at `lib/push-notifications.ts:33` and `lib/dashboard-context.tsx:238` are sensitive delivery identifiers, not proof of identity.
10. **High — transport interception and bypass.** `lib/settings.ts:46–58` uses cleartext transports. `lib/dashboard-context.tsx:569–655` can operate Shelly directly even if the API is unavailable. JWT middleware on FastAPI cannot protect a separate publicly reachable Shelly/ESP32 service.
11. **Medium — broad cross-origin exposure.** `backend/app.py:91–95` and `firmware/src/net/ApiServer.cpp:72–79` permit every origin. This compounds the public API surface; CORS itself is not an authentication mechanism.
12. **High — separate unprotected firmware path.** `firmware/src/net/ApiServer.cpp:139–189, 282–369` duplicates unauthenticated controls and OTP recovery. `firmware/src/net/ConfigPortal.cpp:127–132` uses a fixed setup hotspot password and exposes configuration writes without a second authorization step. `firmware/src/core/Config.h:16` also ships a fixed normal-hotspot password.
13. **High — firmware SMS TLS verification disabled.** `firmware/src/services/OtpService.cpp:75–80`: `setInsecure()` permits interception of Twilio credentials and OTP SMS delivery. Token lifetime does not protect the Twilio secret.
14. **Missing — account lifecycle and accountability.** `backend/db.py:14–49` contains no account/role/status schema. There are no signup approvals, rejection records, role-change records, persistent login defenses, or seed-only administrator credentials to audit or enforce.

No attack was sent to real hardware, a real account, Firebase, Twilio, or an SMTP destination. Verification uses disposable databases and mock hardware.
