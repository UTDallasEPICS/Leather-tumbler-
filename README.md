# UTDallas EPICS DAVA Leather Tumbler Project

**Authentication has changed:** the local PIN gate has been replaced with FastAPI accounts, admin-approved signup, Argon2id passwords and 30-minute JWT sessions. Before starting the backend, follow [authentication setup, audit and verification](docs/security/README.md). The backend requires a signing key and a one-time admin seed. HTTPS/WSS and hardware network isolation are required for deployment.

Controller for a Leather Tumbler rig. An ESP32 reads a DS18B20 temperature probe and an ADS1115-fed pH sensor, drives the motor (Shelly relay, GPIO relay or PWM H-bridge), and exposes a REST + WebSocket API. The Next.js app, installed as the Android APK on a phone or tablet, talks to it over Wi-Fi. (The original Raspberry Pi + FastAPI backend is kept in `backend/` as a legacy dev server; see below.)

#**Our Goal**

The client will be able to view various data metric recorded from the tumbler while in operation. The current implementation inclues a 1 wire Digital Temperature sensor and a analog Ph sensor, this set of sensors covers the crucial needs of the client where this data can indicate whether the leather may get damaged or glaring issues in the leather curing process.

#**Functional Requirements**

Firstly the homepage presents the user with a direct control button to the tumbler, and it also shows a Ph gauge as well as a Temperature wheel. The app will react with sounds and alarms according to configs in the settings page. The analytics page for Ph and temperature repectively have graphs and visual showing records being produced live. This helps the client realize sudden spikes that may occure in the proccess. The settings page is fuly configureation oriented with fields to input the ip of the Pi and the shelly (this will only acutally work properly on the apk compiled version).

#Third Party Integrations

Authentication is owned by FastAPI and SQLite. Firebase messaging was a notification transport, not a login method; the former public push relay has been retired.

## ESP32 controller (current)

```
Phone (Android app, bundled UI)
   │  http://<controller>:8765/api/*     REST
   │  ws://<controller>:8765/ws          broadcast WebSocket
   ▼
ESP32 firmware (firmware/)
   ├── DS18B20      (1-Wire, GPIO4)
   ├── ADS1115 pH   (I2C, SDA 21 / SCL 22, addr 0x48)
   ├── Motor drive  (Shelly Pro 2 over Wi-Fi | GPIO relay | PWM H-bridge, chosen in setup)
   └── Flash        (settings, cycles, recovery phone, run history; readings kept in RAM)
```

It serves the **same API on the same port** as the old backend, so the app needs no changes beyond
pointing **Connection → Server IP** at the controller. Build, flash, wiring and first-boot setup are in
[firmware/README.md](firmware/README.md). Two network modes: join an existing Wi-Fi, or run as the
hotspot itself (address `10.3.141.1`, the same subnet the old RaspAP setup used, so the Shelly at
`10.3.141.50` keeps working).

The ESP32 does not host the web app. Use the Android APK (`npm run build && npx cap sync android`,
then `./gradlew installDebug` in `android/`), which already contains the UI.

## Runs

A run is one batch of hides taken through the recipe, step by step. Real runs are kept on the
controller (the ESP32, or the Python backend in development), so every phone and computer pointed at
it shares the same runs, history and suggestions, and the one-run-per-tumbler rule holds across
devices. The controller also adds up the drum's temperature and pH for each stage while the drum turns,
whether or not an app is open.

Each device keeps a copy, so the app opens straight away and keeps working when the controller can't be
reached. Changes made offline are sent when it's back; if another device changed the same run in the
meantime, both sets of changes are kept. If two devices start a run on the same tumbler while offline,
the first to reach the controller wins and the other is kept in the history as overridden, with a
note on screen. The line under a run says where it stands:

| Line | Meaning |
|---|---|
| Saved on the tumbler | up to date |
| Offline · changes will sync | changes made here are waiting for the controller |
| Updated on another device | someone else just changed it |
| Saved on this device only | the controller's firmware predates shared runs: flash the current firmware and the app moves the runs over by itself |

Demo Mode runs (and the made-up history behind its suggestions) stay on the device and never reach a
controller. The API both servers implement is described at the top of [lib/runs-api.ts](lib/runs-api.ts).

## Leather inspection (defect model)

The **Inspection** page checks photos of the leather with a defect model. It shows how often the model is
right, which defects people confirm, and which run readings (stage temperature, pH, drum speed) went with
more defective hides. The model runs on a laptop or mini PC on the same Wi-Fi (`vision/service.py`, port
8770), not on the ESP32; set its address under **Connection → Inspection server**. Demo Mode shows real
model output on public test photos without the server.

Training, the server, current results and how to retrain on our own photos are in
[vision/README.md](vision/README.md).

## Legacy architecture: Raspberry Pi backend (`backend/`)

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

REST routes are under `/api/*` (`/system/state`, `/system/start`, `/system/stop`, `/system/reset-cycles`, `/system/clear-logs`, `/system/relay-status`, `/readings/history`, `/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/me`, `/admin/users`, `/admin/audit`). The WebSocket at `/ws` is broadcast-only — the server pushes `system_state` and live sensor frames; client messages are ignored.

## First-time Pi setup

Clone the repo to `~/Downloads/Leather-tumbler-` (the path matters — `setup.sh` resolves the PWA directory as `${SCRIPT_DIR}/../out`). Then:

```
cd ~/Downloads/Leather-tumbler-/backend
bash setup.sh
```

The script is **idempotent** — it stops, disables, and removes any prior `sensorhub`/`sensorhub-pwa` units before doing anything else, so re-running is always safe. It will:

1. `apt update && apt upgrade`, install `python3 python3-pip python3-venv curl i2c-tools python3-smbus`.
2. Ask for the DS18B20 GPIO (default 4) and write `dtoverlay=w1-gpio,gpiopin=N` plus `dtparam=i2c_arm=on` into `/boot/firmware/config.txt`. Adds you to the `i2c` group.
3. Ask for the Shelly Pro 2 IP — leave blank for mock relay mode. (currently ip is static to 10.3.141.50 via RaspAp
4. Ask for the backend port (default `8765`).
5. Write `backend/config.json`, create `backend/venv`, install `backend/requirements.txt`.
6. Probe hardware: DS18B20 (reads a temperature), ADS1115 at `0x48`, Shelly RPC.
7. Optionally create the PWA static service (`python3 -m http.server 8080 --directory ../out`). **Say y here** if you want phones to open the app.
8. Optionally publish the site through ngrok by running `setup_ngrok.sh` (see [Remote access with ngrok](#remote-access-with-ngrok)). Because this step rewrites `config.json`, answer y again whenever you re-run `setup.sh`.

Reboot if 1-Wire didn't pick up the sensor on the probe step (`sudo reboot`).

One big thing to remember due to RaspAp the network is configured in a way where the Pi will only recieve internet via ethernet, this is because wlan0 is reserved for the local hotpost netowrk Tumbler-Iot. So if you need internet to install packages or anything use a ethernet cable to some device that tethers internet via RJ45. Any issues in the setup.sh that include the python venv env is ok if the script runs with an already built venv env predisposed to the script in the folder.

After setup:

```
sudo systemctl status sensorhub sensorhub-pwa
journalctl -u sensorhub -f
```

## Build and deploy the PWA from your laptop

Before you try this i recomend development of anything backend related to be tested on the Pi it makes things very easy (this is very obvious though).
Also make sure you Node.js, if you the run the command it'll show a curl script in the terminal just put that in.

```
pnpm install
pnpm build                              # writes out/ at the repo root
rsync -avz --delete out/ tumbler@<pi-ip>:~/Downloads/Leather-tumbler-/out/
```

`sensorhub-pwa` serves `out/` directly with no caching, so no service restart is needed for a frontend-only change. For backend changes, rsync the changed files under `backend/` and `sudo systemctl restart sensorhub`.

## Remote access with ngrok

Publishes the Pi backend at your ngrok domain over HTTPS (for example `https://something.ngrok-free.app`), so the app works away from the Tumbler-Iot hotspot. The backend serves the built site, `/api` and `/ws` all on port 8765, and a `sensorhub-ngrok` systemd service tunnels that one port. Traffic goes through ngrok's servers, so check this is allowed before you use it.

Before you start, you need:
- the Pi backend set up with `setup.sh`
- `.env.auth` and a seeded admin ([authentication setup](docs/security/README.md))
- `out/` built and rsynced to the Pi
- ethernet internet on the Pi
- a free ngrok account: copy your authtoken and claim your free static domain under **Domains** in the ngrok dashboard

```
cd ~/Downloads/Leather-tumbler-/backend
bash setup_ngrok.sh
```

The script will:
1. install the ngrok agent
2. save your authtoken
3. set `web_dir` and `trust_proxy` in `config.json`
4. add `https://<your-domain>` to `AUTH_ORIGINS` in `.env.auth`
5. restart `sensorhub` and start `sensorhub-ngrok`

It is safe to re-run.

Then open the domain and sign in. On the free plan, ngrok shows a warning page on the first visit; click **Visit Site**. Turn Demo Mode off in Settings. Pages served over HTTPS use their own address as the API automatically, so you don't need to enter a server address.

- **Only the Pi backend may be tunnelled, never the ESP32.** The ESP32's start and stop endpoints have no login.
- `trust_proxy` takes the visitor's IP from ngrok's `X-Forwarded-For` header, so the login rate limit counts each visitor separately. It only trusts the header on connections from the Pi itself.
- After a frontend redeploy (rsync `out/`), the change is live straight away. Phones may need their site data cleared, the same as on the LAN.

```
journalctl -u sensorhub-ngrok -f
sudo systemctl stop sensorhub-ngrok        # take the site offline
sudo systemctl disable sensorhub-ngrok     # keep it off after reboot
```

## Local development

```
pnpm dev
```

Opens `http://localhost:3000`. `next-pwa` is disabled in dev mode (per [next.config.js](next.config.js)), so no service-worker caching to fight while iterating. Either run the backend locally (`cd backend && python main.py --mock`) or open Settings and point Server IP at your Pi's address.

## Settings, connection, and accounts

The Server IP **defaults to whatever hostname the page was loaded from** (see [lib/settings.ts](lib/settings.ts)). When the PWA is served from `http://192.168.4.71:8080`, the default Server IP is `192.168.4.71` — you do not type anything. One thing to clarify the relay fallback only works if the app is ran via a compiled apk as although the PWA is served and recommneded, inorder for the feature to work the app must be individual from the raspberry pi. 

Caveat: any value you Save in Settings is written to `localStorage` under the key `sensorhub-settings` and overrides the auto-detected default. If a phone ever saved `localhost`, it stays `localhost` even after the Pi's IP changes. Two ways to clear:

- Phone browser → site settings for `<pi-ip>:8080` → **Clear & reset** (this also unregisters the service worker — best option after a frontend redeploy).
- Or open Settings, type the right IP, **Save**.

Other defaults:
- **Demo Mode** is on by default so the app boots cleanly on first launch with no backend. Toggle it off and Save to use real data.
- **Accounts:** request signup with your name, email, and password. A sysadmin approves and assigns worker or sysadmin. The old PIN is no longer used. See [authentication setup](docs/security/README.md).

## External services and credentials

- **Twilio / PIN recovery:** the insecure mock OTP reset flow has been removed. Account recovery is not yet implemented.
- **Firebase push:** the unauthenticated Next.js relay is retired (HTTP 410). Local notifications remain; server push requires a future authenticated device-registration design.
- **Shelly Pro 2** — local HTTP RPC, no credentials. Set the IP in `setup.sh` or leave blank for mock.
- **ngrok** — optional, for remote access. Authtoken is stored by the ngrok agent in `~/.config/ngrok/ngrok.yml` on the Pi. See [Remote access with ngrok](#remote-access-with-ngrok).

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
| `pnpm build` fails with `Service account object must contain a string "project_id" property` | [app/api/send-fcm/route.ts](app/api/send-fcm/route.ts) regressed to top-level `admin.initializeApp()`. Move it back into a function called from inside the POST handler so it runs at request time, not at build time. | The network Tumbler-Iot won't turn on so run "sudo systemctl restart hostapd@wlan0" without quotes, this restart the system level service that I put in to start the local network on boot|

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

- [app/](app/) — Next.js app router pages (dashboard, settings, account, configure, analytics; `/logs` redirects to analytics, which now holds the readings table)
- [components/](components/) — React components, shadcn/ui
- [lib/](lib/) — frontend state and helpers ([dashboard-context.tsx](lib/dashboard-context.tsx), [settings.ts](lib/settings.ts), [api.ts](lib/api.ts), [auth-context.tsx](lib/auth-context.tsx))
- [firmware/](firmware/) — ESP32 controller firmware (PlatformIO): sensors, motor drive, Wi-Fi, REST + WebSocket API
- [vision/](vision/) — leather defect model: training (Anomalib PatchCore), evaluation and the inspection server the Inspection page talks to
- [backend/](backend/) — legacy Raspberry Pi / laptop dev server: FastAPI app ([app.py](backend/app.py), [main.py](backend/main.py)), sensor readers, relay controller, OTP service, [setup.sh](backend/setup.sh), [requirements.txt](backend/requirements.txt)
- [android/](android/) — Capacitor Android wrapper, only relevant if you want a native APK
- `out/` — static-export build artifact (generated, not in git)
- [public/](public/) — static assets served by Next/PWA, plus the generated `sw.js`

## Stack

Frontend: Next.js 16 (webpack, `output: 'export'`), React 19, Tailwind v4, shadcn/Radix, `next-pwa@5.6`, Recharts/Chart.js, Capacitor.
Controller: ESP32 (Arduino framework, PlatformIO), ESPAsyncWebServer, ArduinoJson.
Legacy backend: Python 3.13, FastAPI, uvicorn, aiosqlite, httpx, `adafruit-circuitpython-ads1x15`, `lgpio`, RaspAp.
