// DAVA Leather Tumbler controller: replaces the Raspberry Pi backend with a single ESP32.
//
// main.cpp only wires modules together:
//   core/      config, clock, run state, reading history
//   sensors/   temperature + pH drivers behind small interfaces
//   drive/     the motor/relay drivers behind one interface
//   net/       Wi-Fi, REST + WebSocket API, first-boot setup portal
//   services/  OTP / recovery phone, the once-a-second sensor loop
// Which hardware is used is decided in HardwareFactory.h from the saved config.

#include <Arduino.h>
#include <memory>
#include "AppContext.h"
#include "HardwareFactory.h"
#include "core/Log.h"
#include "net/ApiServer.h"
#include "net/ConfigPortal.h"
#include "net/WifiService.h"
#include "services/SensorLoop.h"

static constexpr int kBootButtonPin = 0;  // the BOOT button on the dev board

static AppConfig cfg;
static Clock clk;
static SystemState state;
static ReadingStore store;
static OtpService otp;
static RecoveryStore recovery;
static WifiService wifi;
static Hardware hw;

static std::unique_ptr<AppContext> ctx;
static std::unique_ptr<ApiServer> api;
static std::unique_ptr<SensorLoop> sensorLoop;
static std::unique_ptr<ConfigPortal> portal;

static bool portalMode = false;

// Hold BOOT for 3 seconds right after power-up to forget the Wi-Fi and open the setup portal.
static bool bootButtonHeld() {
  pinMode(kBootButtonPin, INPUT_PULLUP);
  if (digitalRead(kBootButtonPin) != LOW) return false;
  uint32_t start = millis();
  while (digitalRead(kBootButtonPin) == LOW) {
    if (millis() - start >= 3000) return true;
    delay(20);
  }
  return false;
}

static void startPortal() {
  portalMode = true;
  portal.reset(new ConfigPortal(cfg));
  portal->begin();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  LOG("DAVA Leather Tumbler controller %s", DAVA_FW_VERSION);

  cfg.load();
  state.begin();  // boots stopped; cycles come back from flash

  // Bring the drive up first so its pins are in the safe (stopped) state while Wi-Fi connects.
  hw = buildHardware(cfg);

  if (bootButtonHeld()) {
    LOG("BOOT held: forgetting Wi-Fi");
    cfg.clearWifi();
  }

  bool networkUp = false;
  if (cfg.hotspot) networkUp = wifi.startHotspot(cfg);
  else if (cfg.hasNetwork()) networkUp = wifi.connectStation(cfg);
  if (!networkUp) {
    startPortal();
    return;
  }

  clk.begin(cfg.timezone);
  wifi.startMdns(cfg);

  // A controller that reboots mid-run must not leave a networked relay switched on.
  hw.drive->stop();

  otp.configure(cfg);
  ctx.reset(new AppContext{cfg, state, store, clk, hw, otp, recovery});
  api.reset(new ApiServer(*ctx));
  api->begin();
  sensorLoop.reset(new SensorLoop(*ctx, *api));

  LOG("ready: http://%s:%u", deviceIp().c_str(), (unsigned)cfg.port);
}

void loop() {
  if (portalMode) {
    portal->loop();
    delay(10);
    return;
  }
  wifi.loop();
  sensorLoop->tick();
  api->loop();
  delay(5);
}
