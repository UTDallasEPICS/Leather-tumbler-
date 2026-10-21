#pragma once
// DS18B20 1-Wire probe (the waterproof stainless one). Data pin needs a 4.7k pull-up to 3V3.

#include <DallasTemperature.h>
#include <OneWire.h>
#include "Sensors.h"

class Ds18b20Sensor : public ITemperatureSensor {
 public:
  explicit Ds18b20Sensor(uint8_t dataPin) : wire_(dataPin), dallas_(&wire_) {}

  bool begin() override {
    dallas_.begin();
    present_ = dallas_.getDeviceCount() > 0;
    if (present_) dallas_.setResolution(12);  // 0.0625 C steps, ~750 ms per conversion
    return present_;
  }

  bool read(float& celsius) override {
    if (!present_) return false;
    dallas_.requestTemperatures();  // blocks ~750 ms; runs in loop(), not in the web tasks
    float t = dallas_.getTempCByIndex(0);
    // DEVICE_DISCONNECTED_C = unplugged or CRC failure; 85.0 is the chip's power-on value.
    if (t == DEVICE_DISCONNECTED_C || t == 85.0f) return false;
    celsius = roundf(t * 100.0f) / 100.0f;
    return true;
  }

  const char* name() const override { return "ds18b20"; }
  bool present() const override { return present_; }

 private:
  OneWire wire_;
  DallasTemperature dallas_;
  bool present_ = false;
};
