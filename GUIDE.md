# Tumbler App — Deployment Guide

Everything runs on the Raspberry Pi: sensor reader, FastAPI backend, and Next.js frontend.

---

## Folder Structure on the Pi

Set this up before running anything:

```
/home/tumbler/tumbler-app/
  api.py
  sensor_reader.py
  switch_controller.py        ← your existing file
  sensor-reader.service
  tumbler-api.service
  tumbler-web.service
  setup.sh
  web/                        ← your Next.js project
    app/
      page.tsx
    components/
      TempChart.tsx
      StatsBar.tsx
      LogPanel.tsx
      TumblerControls.tsx     ← new
    .env.local                ← new
    next.config.js            ← new/updated
    package.json
    ... (rest of Next.js project)
```

---

## Step-by-Step

### 1 — Transfer all files to the Pi

From your dev machine, copy everything into the folder:

```bash
# Copy Python + service files + setup script
scp api.py sensor_reader.py switch_controller.py \
    sensor-reader.service tumbler-api.service tumbler-web.service \
    setup.sh \
    tumbler@<PI_IP>:/home/tumbler/tumbler-app/

# Copy the Next.js project into the web/ subfolder
scp -r ./your-nextjs-project/* tumbler@<PI_IP>:/home/tumbler/tumbler-app/web/
```

> Replace `<PI_IP>` with your Pi's IP address. Find it with `hostname -I` on the Pi.

---

### 2 — SSH into the Pi

```bash
ssh tumbler@<PI_IP>
```

---

### 3 — Run the setup script

```bash
cd /home/tumbler/tumbler-app
bash setup.sh
```

This will:
- Install Node.js via nvm (if not already installed)
- Install Python dependencies (fastapi, uvicorn)
- Install Next.js npm dependencies
- Build the Next.js app
- Copy static assets for the standalone build
- Install and start all 3 systemd services

---

### 4 — Verify everything is running

```bash
sudo systemctl status sensor-reader
sudo systemctl status tumbler-api
sudo systemctl status tumbler-web
```

All three should show `active (running)`.

---

### 5 — Open the app

From any device on the same network:

```
http://<PI_IP>:3000
```

---

## Useful Commands

| What | Command |
|------|---------|
| Live sensor logs | `journalctl -fu sensor-reader` |
| Live API logs | `journalctl -fu tumbler-api` |
| Live web logs | `journalctl -fu tumbler-web` |
| Restart all | `sudo systemctl restart sensor-reader tumbler-api tumbler-web` |
| Stop all | `sudo systemctl stop sensor-reader tumbler-api tumbler-web` |
| Test API directly | `curl http://localhost:8000/temperature/latest` |
| Test switch state | `curl http://localhost:8000/tumbler/state` |

---

## Updating the App Later

After making changes to the Next.js code on your dev machine:

```bash
# Re-copy changed files
scp -r ./web/* tumbler@<PI_IP>:/home/tumbler/tumbler-app/web/

# SSH in and rebuild
ssh tumbler@<PI_IP>
cd /home/tumbler/tumbler-app/web
npm run build
cp -r .next/static .next/standalone/.next/static
sudo systemctl restart tumbler-web
```

After changing Python files:

```bash
scp api.py sensor_reader.py tumbler@<PI_IP>:/home/tumbler/tumbler-app/
ssh tumbler@<PI_IP>
sudo systemctl restart tumbler-api sensor-reader
```
