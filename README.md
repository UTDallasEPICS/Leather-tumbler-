# DAVA Leather Tumbler

Controller for a leather-tumbler rig. A Raspberry Pi reads a DS18B20 temperature probe and an ADS1115-fed pH sensor, drives a Shelly Pro 2 relay, and exposes a FastAPI backend. A Next.js static-export PWA — served from the same Pi — is opened on a phone or tablet on the workshop LAN.

## Architecture

```
Phone browser
   │  http://<pi>:8080            (static PWA, systemd: sensorhub-pwa)
   ▼
Next.js static bundle (out/)
   │  http://<pi>:8765/api/*      REST
   │  ws://<pi>:8765/ws           broadcast WebSocket
   ▼
FastAPI / uvicorn (systemd: sensorhub)
   ├── DS18B20      (1-Wire, GPIO4 default)
   ├── ADS1115 pH   (I2C bus 1, addr 0x48)
   ├── Shelly Pro 2 (HTTP RPC, optional — mock if blank)
   ├── SQLite       (backend/sensorhub.db)
   ├── Twilio       (SMS OTP for Forgot PIN, optional)
   └── Firebase     (FCM push, used in dev / Capacitor APK)
```

REST routes are under `/api/*` (`/system/state`, `/system/start`, `/system/stop`, `/system/reset-cycles`, `/system/clear-logs`, `/system/relay-status`, `/readings/history`, `/recovery/phone`, `/auth/otp/request`, `/auth/otp/verify`). The WebSocket at `/ws` is broadcast-only — the server pushes `system_state` and live sensor frames; client messages are ignored.

## First-time Pi setup

Clone the repo to `~/Downloads/Leather-tumbler-` (the path matters — `setup.sh` resolves the PWA directory as `${SCRIPT_DIR}/../out`). Then:

```
cd ~/Downloads/Leather-tumbler-/backend
bash setup.sh
```

The script is **idempotent** — it stops, disables, and removes any prior `sensorhub`/`sensorhub-pwa` units before doing anything else, so re-running is always safe. It will:

1. `apt update && apt upgrade`, install `python3 python3-pip python3-venv curl i2c-tools python3-smbus`.
2. Ask for the DS18B20 GPIO (default 4) and write `dtoverlay=w1-gpio,gpiopin=N` plus `dtparam=i2c_arm=on` into `/boot/firmware/config.txt`. Adds you to the `i2c` group.
3. Ask for the Shelly Pro 2 IP — leave blank for mock relay mode.
4. Ask for the backend port (default `8765`).
5. Write `backend/config.json`, create `backend/venv`, install `backend/requirements.txt`.
6. Probe hardware: DS18B20 (reads a temperature), ADS1115 at `0x48`, Shelly RPC.
7. Optionally create the PWA static service (`python3 -m http.server 8080 --directory ../out`). **Say y here** if you want phones to open the app.
8. Optionally install `cloudflared` and print remote-tunnel commands.

Reboot if 1-Wire didn't pick up the sensor on the probe step (`sudo reboot`).

After setup:

```
sudo systemctl status sensorhub sensorhub-pwa
journalctl -u sensorhub -f
```

## Build and deploy the PWA from your laptop

```
pnpm install
pnpm build                              # writes out/ at the repo root
rsync -avz --delete out/ tumbler@<pi-ip>:~/Downloads/Leather-tumbler-/out/
```

`sensorhub-pwa` serves `out/` directly with no caching, so no service restart is needed for a frontend-only change. For backend changes, rsync the changed files under `backend/` and `sudo systemctl restart sensorhub`.

## Local development

```
pnpm dev
```

Opens `http://localhost:3000`. `next-pwa` is disabled in dev mode (per [next.config.js](next.config.js)), so no service-worker caching to fight while iterating. Either run the backend locally (`cd backend && python main.py --mock`) or open Settings and point Server IP at your Pi's address.

## Settings, IP, and PIN

The Server IP **defaults to whatever hostname the page was loaded from** (see [lib/settings.ts](lib/settings.ts)). When the PWA is served from `http://192.168.4.71:8080`, the default Server IP is `192.168.4.71` — you do not type anything.

Caveat: any value you Save in Settings is written to `localStorage` under the key `sensorhub-settings` and overrides the auto-detected default. If a phone ever saved `localhost`, it stays `localhost` even after the Pi's IP changes. Two ways to clear:

- Phone browser → site settings for `<pi-ip>:8080` → **Clear & reset** (this also unregisters the service worker — best option after a frontend redeploy).
- Or open Settings, type the right IP, **Save**.

Other defaults:
- **Demo Mode** is on by default so the app boots cleanly on first launch with no backend. Toggle it off and Save to use real data.
- **PIN** is `1234` (see [lib/pin-auth.ts](lib/pin-auth.ts)). Change it under Account.

## External services and credentials

- **Twilio (SMS OTP)** — set under a `twilio` key in `backend/config.json`. Without it, the Forgot-PIN flow falls back to a "mock" delivery that returns the OTP in the response body and shows it in the UI as `Test OTP: 123456`.
- **Firebase Admin (FCM push)** — used by [app/api/send-fcm/route.ts](app/api/send-fcm/route.ts). Reads `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` from env. The static-export build does not host this route at runtime — it's only live in `pnpm dev` or on a Node host. Push notifications also work natively in the Capacitor APK without this endpoint.
- **Shelly Pro 2** — local HTTP RPC, no credentials. Set the IP in `setup.sh` or leave blank for mock.
- **Cloudflare Tunnel** — optional, for remote access. `setup.sh` offers to install `cloudflared` and prints tunnel commands like `cloudflared tunnel --url http://localhost:8080 --no-autoupdate`.

## Common issues

| Symptom | Fix |
|---|---|
| Settings shows "Disconnected" but Pi is reachable | Settings is showing `localhost` from old localStorage. Clear site data on the phone, or type the Pi IP and Save. |
| PWA shows old UI after a redeploy | Service worker is serving cached chunks. Clear site data, or in DevTools → Application → Service workers → Unregister, then hard reload. |
| Sensor "Not found" after setup | Reboot the Pi. The 1-Wire kernel module loads at boot. |
| `/ws` returns HTTP 500, `journalctl` shows `TypeError: get_broadcaster() missing 1 required positional argument: 'request'` | [backend/deps.py](backend/deps.py) must use `HTTPConnection` (parent of both `Request` and `WebSocket`), not bare `Request`. WebSocket scopes don't carry a `Request`. |
| `crypto.randomUUID is not a function` in browser console | `crypto.randomUUID` only exists in secure contexts (HTTPS or `localhost`). The code falls back to `genId()` in [lib/dashboard-context.tsx](lib/dashboard-context.tsx) — make sure you're on the latest build. |
| Two backends fighting on port 8765 / dashboard shows stale data after re-clone | Re-run `bash setup.sh` (it wipes prior units). Or manually: `sudo systemctl stop sensorhub sensorhub-pwa && sudo rm /etc/systemd/system/sensorhub*.service && sudo systemctl daemon-reload`. |
| Backend won't start after a fresh `git pull` | New Python deps. `cd backend && source venv/bin/activate && pip install -r requirements.txt`, then `sudo systemctl restart sensorhub`. |
| `pnpm build` fails with `Service account object must contain a string "project_id" property` | [app/api/send-fcm/route.ts](app/api/send-fcm/route.ts) regressed to top-level `admin.initializeApp()`. Move it back into a function called from inside the POST handler so it runs at request time, not at build time. |

## Useful one-liners

Backend alive:
```
curl http://<pi>:8765/api/system/state           # {"active":false,"cycles":0}
```

Static server alive:
```
curl -I http://<pi>:8080/                         # HTTP/1.0 200 OK
```

Real WebSocket handshake (any machine with node):
```
node --eval "const h=require('http'),c=require('crypto');const r=h.request({host:'<pi>',port:8765,path:'/ws',method:'GET',headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Key':c.randomBytes(16).toString('base64'),'Sec-WebSocket-Version':'13'}});r.on('upgrade',(_,s)=>{s.once('data',d=>{console.log(String(d).slice(0,200));process.exit(0)})});r.on('response',res=>{console.log('HTTP',res.statusCode);process.exit(1)});r.end()"
```
Should print `{"type":"system_state","active":false,"cycles":0}`.

## Repo map

- [app/](app/) — Next.js app router pages (dashboard, settings, account, configure, analytics, logs)
- [components/](components/) — React components, shadcn/ui
- [lib/](lib/) — frontend state and helpers ([dashboard-context.tsx](lib/dashboard-context.tsx), [settings.ts](lib/settings.ts), [api.ts](lib/api.ts), [pin-auth.ts](lib/pin-auth.ts))
- [backend/](backend/) — FastAPI app ([app.py](backend/app.py), [main.py](backend/main.py)), sensor readers, relay controller, OTP service, [setup.sh](backend/setup.sh), [requirements.txt](backend/requirements.txt)
- [android/](android/) — Capacitor Android wrapper, only relevant if you want a native APK
- `out/` — static-export build artifact (generated, not in git)
- [public/](public/) — static assets served by Next/PWA, plus the generated `sw.js`

## Stack

Frontend: Next.js 16 (webpack, `output: 'export'`), React 19, Tailwind v4, shadcn/Radix, `next-pwa@5.6`, Recharts/Chart.js, Capacitor.
Backend: Python 3.13, FastAPI, uvicorn, aiosqlite, httpx, `adafruit-circuitpython-ads1x15`, `lgpio`.
