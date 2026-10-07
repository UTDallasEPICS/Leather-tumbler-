#pragma once
// Joins the workshop Wi-Fi, keeps the link up, and advertises tumbler.local.

#include <Arduino.h>
#include <ESPmDNS.h>
#include <WiFi.h>
#include "../core/Config.h"
#include "../core/Log.h"

// The address the app should use, whichever mode we are in.
inline String deviceIp() {
  return WiFi.getMode() == WIFI_AP ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
}

class WifiService {
 public:
  // Be the network ourselves (phone + Shelly join us). Fixed address 10.3.141.1, the same subnet
  // the old RaspAP hotspot used, so a Shelly at 10.3.141.50 keeps working untouched.
  bool startHotspot(const AppConfig& cfg) {
    WiFi.persistent(false);
    WiFi.mode(WIFI_AP);
    WiFi.softAPConfig(IPAddress(10, 3, 141, 1), IPAddress(10, 3, 141, 1), IPAddress(255, 255, 255, 0));
    bool ok = cfg.apPass.length() >= 8 ? WiFi.softAP(cfg.apSsid.c_str(), cfg.apPass.c_str(), 1, 0, 6)
                                       : WiFi.softAP(cfg.apSsid.c_str());
    if (ok) LOG("wifi: hotspot '%s' up, IP %s", cfg.apSsid.c_str(), WiFi.softAPIP().toString().c_str());
    else LOG("wifi: could not start hotspot");
    return ok;
  }

  // Blocks up to timeoutMs. Returns false if the network didn't accept us (portal takes over).
  bool connectStation(const AppConfig& cfg, uint32_t timeoutMs = 20000) {
    WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    WiFi.setHostname(cfg.hostname.c_str());
    WiFi.setAutoReconnect(true);
    WiFi.setSleep(false);  // keeps WebSocket latency low
    WiFi.begin(cfg.wifiSsid.c_str(), cfg.wifiPass.c_str());
    LOG("wifi: connecting to '%s'", cfg.wifiSsid.c_str());

    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) delay(250);

    if (WiFi.status() != WL_CONNECTED) {
      LOG("wifi: could not connect");
      return false;
    }
    LOG("wifi: connected, IP %s", WiFi.localIP().toString().c_str());
    return true;
  }

  void startMdns(const AppConfig& cfg) {
    if (MDNS.begin(cfg.hostname.c_str())) {
      MDNS.addService("http", "tcp", cfg.port);
      LOG("mdns: %s.local", cfg.hostname.c_str());
    }
  }

  // Auto-reconnect handles most drops; this nudges it if it gives up.
  void loop() {
    if (millis() - lastCheck_ < 10000) return;
    lastCheck_ = millis();
    if (WiFi.getMode() == WIFI_AP) return;  // hotspot has nothing to reconnect
    if (WiFi.status() != WL_CONNECTED) {
      LOG("wifi: link down, reconnecting");
      WiFi.reconnect();
    }
  }

 private:
  uint32_t lastCheck_ = 0;
};
