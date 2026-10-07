#pragma once
// Simulated sensors for bench testing without any hardware. Only used when "mock hardware" is
// switched on explicitly. A missing real sensor reports "no reading" instead of inventing one.

#include "Sensors.h"

class MockTemperatureSensor : public ITemperatureSensor {
 public:
  bool begin() override { return true; }
  bool read(float& celsius) override {
    float drift = ((float)random(-500, 701)) / 1000.0f;  // slight upward bias, like heating
    value_ = constrain(value_ + drift, 15.0f, 70.0f);
    celsius = roundf(value_ * 100.0f) / 100.0f;
    return true;
  }
  const char* name() const override { return "mock"; }
  bool present() const override { return true; }

 private:
  float value_ = 25.0f;
};

class MockPhSensor : public IPhSensor {
 public:
  bool begin() override { return true; }
  bool read(float& ph) override {
    float drift = ((float)random(-100, 101)) / 1000.0f;
    value_ = constrain(value_ + drift, 0.0f, 14.0f);
    ph = roundf(value_ * 100.0f) / 100.0f;
    return true;
  }
  const char* name() const override { return "mock"; }
  bool present() const override { return true; }

 private:
  float value_ = 7.0f;
};
