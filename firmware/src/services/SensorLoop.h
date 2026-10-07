#pragma once
// Once a second, while a run is active: read both sensors, remember the readings, and push them
// to every connected app. Same behaviour as backend/services/sensor_loop.py.

#include "../AppContext.h"
#include "../net/ApiServer.h"

class SensorLoop {
 public:
  SensorLoop(AppContext& ctx, ApiServer& api) : c_(ctx), api_(api) {}

  // Call from loop(). The DS18B20 conversion blocks for ~750 ms, which is fine here: the web
  // server runs on its own tasks and keeps answering requests.
  void tick() {
    if (millis() - last_ < 1000) return;
    last_ = millis();

    if (!c_.state.snapshot().active) return;

    float t;
    if (c_.hw.temperature->read(t)) {
      Reading r = c_.store.addTemperature(t, c_.clock.iso());
      api_.broadcastReading("temperature", r);
    }

    float ph;
    if (c_.hw.ph->read(ph)) {
      Reading r = c_.store.addPh(ph, c_.clock.iso());
      api_.broadcastReading("ph", r);
    }
  }

 private:
  AppContext& c_;
  ApiServer& api_;
  uint32_t last_ = 0;
};
