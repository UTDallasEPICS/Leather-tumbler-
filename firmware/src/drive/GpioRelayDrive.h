#pragma once
// A relay (or solid-state relay) module wired to one GPIO. On/off only.

#include "../core/Log.h"
#include "IDrive.h"

class GpioRelayDrive : public IDrive {
 public:
  GpioRelayDrive(int pin, bool activeHigh) : pin_(pin), activeHigh_(activeHigh) {}

  const char* type() const override { return "relay"; }

  bool begin() override {
    if (pin_ < 0) return false;
    pinMode(pin_, OUTPUT);
    return stop();
  }

  bool start() override { return write(true); }
  bool stop() override { return write(false); }

  DriveStatus status() override {
    DriveStatus s;
    s.on = on_;
    s.source = "gpio";
    return s;
  }

 private:
  bool write(bool on) {
    if (pin_ < 0) return false;
    digitalWrite(pin_, (on == activeHigh_) ? HIGH : LOW);
    on_ = on;
    LOG("drive(relay): %s", on ? "ON" : "OFF");
    return true;
  }

  int pin_;
  bool activeHigh_;
  bool on_ = false;
};
