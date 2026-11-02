#pragma once
// Once a second, while the drum is running: read both sensors, remember the readings, add them to
// the active run's current stage, and push them to every connected app. Same behaviour as
// backend/services/sensor_loop.py.

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

    // totals already counted are written even after the drum stops
    std::vector<RunChange> changes;
    c_.runs.flushSensorsIfDue(c_.clock.nowMs(), changes);
    for (const RunChange& ch : changes) api_.broadcastRun(ch);

    if (!c_.state.snapshot().active) return;

    float t;
    if (c_.hw.temperature->read(t)) {
      Reading r = c_.store.addTemperature(t, c_.clock.iso());
      c_.runs.addReading("temp", t);
      api_.broadcastReading("temperature", r);
    }

    float ph;
    if (c_.hw.ph->read(ph)) {
      Reading r = c_.store.addPh(ph, c_.clock.iso());
      c_.runs.addReading("ph", ph);
      api_.broadcastReading("ph", r);
    }
  }

 private:
  AppContext& c_;
  ApiServer& api_;
  uint32_t last_ = 0;
};
