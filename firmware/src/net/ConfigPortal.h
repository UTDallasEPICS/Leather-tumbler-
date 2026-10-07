#pragma once
// First-boot / recovery setup. When there is no saved Wi-Fi (or it fails, or BOOT is held at
// power-up) the board becomes an access point:
//     network  DAVA-Tumbler-Setup      password  tumbler-setup
//     page     http://192.168.4.1
// Fill in the Wi-Fi and which motor driver is wired, save, and it restarts into normal mode.

#include <ESPAsyncWebServer.h>
#include "../core/Config.h"

class ConfigPortal {
 public:
  explicit ConfigPortal(AppConfig& cfg) : cfg_(cfg), server_(80) {}

  void begin();
  void loop();  // performs the restart after a save

 private:
  String page();
  void save(AsyncWebServerRequest* req);

  AppConfig& cfg_;
  AsyncWebServer server_;
  String networks_;  // <option> list built from a scan at start-up
  bool restartPending_ = false;
  uint32_t restartAt_ = 0;
};
