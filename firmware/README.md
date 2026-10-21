# Tumbler controller firmware (ESP32)

Replaces the Raspberry Pi + Python backend. One ESP32 reads the temperature and pH sensors, drives
the motor, and serves the **same REST + WebSocket API on the same port (8765)**, so the app talks to
it unchanged. Set the app's **Server IP** (Connection page) to the controller's address.

```
Phone (Android app) ── Wi-Fi ──►  ESP32  ──►  DS18B20 (temperature, 1-Wire)
        REST + WebSocket :8765                 ADS1115 (pH, I2C)
                                               motor drive (Shelly | relay | H-bridge)
```

The app itself is delivered by the Android APK, which already contains the whole UI. The ESP32 does
not host the web app (the built UI is several MB, far more than the board's flash).

## Hardware

| Part | ESP32 pin (default) | Notes |
|---|---|---|
| DS18B20 data | GPIO 4 | 4.7 kΩ pull-up to 3V3, VCC 3V3 |
| ADS1115 SDA / SCL | GPIO 21 / 22 | VDD 3V3, ADDR to GND (0x48), pH board output on A0 |
| Relay module (driver `relay`) | GPIO 27 | active-high by default |
| Cytron MD20A / MD13S PWM / DIR (driver `pwmdir`) | GPIO 25 / 26 | GND to the ESP32 GND; no logic supply needed; swap the motor wires if it spins the wrong way |
| Dual-PWM H-bridge RPWM / LPWM (driver `hbridge`) | GPIO 25 / 26 | e.g. BTS7960; tie R_EN and L_EN to 3V3 |
| BOOT button | GPIO 0 | hold 3 s at power-up to re-open setup |

### Motor driver power (Cytron MD20A / MD13S)

Motor supply goes to the driver's **B+ / B-** (6-30 V; the 24 V gearmotor needs a 24 V supply rated for
the start-up surge, 10 A or more), the motor to **M+ / M-**, and the ESP32 only drives the **PWM**, **DIR**
and **GND** pins (3.3 V logic is accepted). Keep the ESP32 GND and the driver GND common. On these boards a
PWM of 0 brakes the motor, so the firmware ramps speed up and down over about 0.8 s and only reverses once the
motor has stopped.

Everything is 3.3 V logic. Pins and driver type are settings, not code: change them in the setup
portal. The ESP32 pins float at power-up, so wire relay and driver inputs with a pull-down so the
motor cannot twitch while the board boots.

## Build and flash

Install [PlatformIO](https://platformio.org/install) (VS Code extension or `pip install platformio`).

```bash
cd firmware
pio run                  # compile
pio run -t upload        # flash over USB
pio device monitor       # serial log, 115200 baud
```

Optional: copy `include/secrets.example.h` to `include/secrets.h` to bake in Wi-Fi and Twilio defaults.

## First boot

1. With nothing saved the board opens its own setup network **DAVA-Tumbler-Setup** (password `tumbler-setup`).
2. Connect a phone to it and open **http://192.168.4.1**.
3. Choose how it connects, pick the motor driver that is wired up, save. The board restarts.
   - **Join an existing Wi-Fi**: enter the network and password. Find its address in the serial monitor
     (`ready: http://192.168.x.x:8765`) or at `http://tumbler.local:8765` where mDNS works.
   - **Be the hotspot**: no router needed. The board becomes the network (default name `Tumbler-Iot`),
     the phone and the Shelly join it, and its address is always **10.3.141.1** (the old RaspAP subnet,
     so a Shelly still at `10.3.141.50` keeps working). Use the same name and password the Pi hotspot had
     and the Shelly reconnects on its own.
4. In the app: **Connection → Server IP** (10.3.141.1 for the hotspot), turn Demo Mode off, Save.
   The app also sets the controller's clock when it connects (a hotspot has no internet time).

To change settings later, hold **BOOT** for 3 seconds while plugging it in.

No hardware yet? Tick **Use simulated sensors and drive** in the portal to bench-test the app against the board.

## Modules

```
src/
  main.cpp              wires the modules together, nothing else
  HardwareFactory.h     config -> drivers (the only place that knows which class to use)
  AppContext.h          shared references handed to the API and sensor loop
  core/                 Config (flash), Clock (SNTP), SystemState, ReadingStore (ring buffers), Mutex, Log
  sensors/              ITemperatureSensor / IPhSensor; Ds18b20, Ads1115 pH, mocks
  drive/                IDrive; ShellyDrive, GpioRelayDrive, PwmDirDrive (Cytron), HBridgeDrive (BTS7960), MockDrive
  net/                  WifiService, ApiServer (routes + WebSocket), ConfigPortal (first-boot setup)
  services/             OtpService + Phone helpers + RecoveryStore, SensorLoop
```

To add a new probe or motor driver: implement the small interface in `sensors/` or `drive/`, add one
branch in `HardwareFactory.h`. Routes, state and the app do not change.

## API

Same as the Python backend (`backend/`):

| | |
|---|---|
| `GET /api/system/state` | `{active, cycles}` |
| `POST /api/system/start`, `/stop` | `{success, state}`; `success` is true only if the drive confirmed |
| `POST /api/system/reset-cycles`, `/clear-logs` | |
| `GET /api/system/relay-status` | `{output, source, error?}` |
| `GET /api/readings/history?limit=` | `{temperature:[...], ph:[...]}`, newest first |
| `GET` / `PUT /api/recovery/phone` | recovery number |
| `POST /api/auth/otp/request`, `/verify` | Forgot-PIN codes (mock mode returns the code; Twilio mode texts it) |
| `WS /ws` | pushes `system_state`, `temperature`, `ph`, `logs_cleared` |

New, optional: `POST /api/system/time {epochMs}` (the app sets the clock), `GET /api/system/info` (firmware, IP, sensor and drive status), `GET /api/system/motor-status`,
`POST /api/system/speed {percent}`, `POST /api/system/direction {direction}` (PWM drives only: `pwmdir` and `hbridge`).

## Differences from the Raspberry Pi backend

- **Reading history is kept in RAM** (last 200 of each) and is lost on reboot. Cycles, Wi-Fi, settings and the
  recovery phone are saved in flash.
- **A missing sensor reports nothing.** The Python backend silently switched to simulated values; the
  firmware only simulates when "simulated hardware" is switched on explicitly.
- **`start` only marks the run active if the drive confirmed it**, and `stop` only marks it stopped if the
  drive confirmed that, so the app never shows a stopped drum that is still turning.
- **The drive is stopped at every boot**, so a restart mid-run cannot leave a networked relay switched on.
- **Twilio SMS is sent in the background**: the API answers "OTP sent" immediately and a delivery failure
  shows only in the serial log. OTP codes live in RAM and are lost on reboot.
- **Timestamps** come from internet time when there is any, otherwise from the phone (it sends its clock on connect), and count from boot until one of those arrives.
- **The Shelly drive blocks briefly** (about 1.5 s per attempt, two attempts) while the request is handled.
- The firmware has no SQLite, so history is not persistent, and cycles are still not counted automatically
  (same as before; the counter only changes through the API).
