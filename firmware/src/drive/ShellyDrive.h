#pragma once
// Shelly Pro 2 relay (channel 0) over its local HTTP RPC API. Same calls the old backend made.
//
// These calls block while the Shelly answers. They run inside web-request handlers, so the
// timeouts are kept short enough (well under the 5 s task watchdog) and there is one retry.

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include "../core/Log.h"
#include "IDrive.h"

class ShellyDrive : public IDrive {
 public:
  explicit ShellyDrive(const String& ip) : ip_(ip) {}

  const char* type() const override { return "shelly"; }

  bool start() override { return setSwitch(true); }
  bool stop() override { return setSwitch(false); }

  DriveStatus status() override {
    DriveStatus s;
    String body;
    if (get("/rpc/Switch.GetStatus?id=0", body)) {
      JsonDocument doc;
      if (!deserializeJson(doc, body)) {
        on_ = doc["output"] | false;
        s.on = on_;
        s.source = "shelly";
        return s;
      }
    }
    s.on = on_;  // last value we know about
    s.source = "cached";
    s.error = true;
    return s;
  }

 private:
  static constexpr int kTimeoutMs = 1500;
  static constexpr int kAttempts = 2;

  bool setSwitch(bool on) {
    String path = String("/rpc/Switch.Set?id=0&on=") + (on ? "true" : "false");
    String body;
    for (int attempt = 1; attempt <= kAttempts; attempt++) {
      if (get(path, body)) {
        on_ = on;
        LOG("drive(shelly): %s", on ? "ON" : "OFF");
        return true;
      }
      LOG("drive(shelly): attempt %d/%d failed", attempt, kAttempts);
      delay(200);
    }
    return false;
  }

  bool get(const String& path, String& body) {
    bool linkUp = WiFi.status() == WL_CONNECTED || WiFi.getMode() == WIFI_AP;  // hotspot mode has no station link
    if (ip_.length() == 0 || !linkUp) return false;
    HTTPClient http;
    http.setConnectTimeout(kTimeoutMs);
    http.setTimeout(kTimeoutMs);
    if (!http.begin(String("http://") + ip_ + path)) return false;
    int code = http.GET();
    if (code == 200) body = http.getString();
    http.end();
    return code == 200;
  }

  String ip_;
  bool on_ = false;
};
