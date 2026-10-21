#pragma once
// Atlas Scientific analog pH board -> ADS1115 ADC (I2C) -> ESP32.
// Same mapping as the old Python backend: 0 V = pH 14, 3 V = pH 0, clamped to 0-14.

#include <Adafruit_ADS1X15.h>
#include <Wire.h>
#include "Sensors.h"

class Ads1115PhSensor : public IPhSensor {
 public:
  Ads1115PhSensor(int sda, int scl, uint8_t address) : sda_(sda), scl_(scl), address_(address) {}

  bool begin() override {
    Wire.begin(sda_, scl_);
    present_ = ads_.begin(address_, &Wire);
    if (present_) ads_.setGain(GAIN_ONE);  // +/- 4.096 V range
    return present_;
  }

  bool read(float& ph) override {
    if (!present_) return false;
    int16_t raw = ads_.readADC_SingleEnded(0);  // channel A0
    float volts = ads_.computeVolts(raw);
    float value = 14.0f - (volts / 3.0f) * 14.0f;
    if (value < 0.0f) value = 0.0f;
    if (value > 14.0f) value = 14.0f;
    ph = roundf(value * 100.0f) / 100.0f;
    return true;
  }

  const char* name() const override { return "ads1115"; }
  bool present() const override { return present_; }

 private:
  Adafruit_ADS1115 ads_;
  int sda_;
  int scl_;
  uint8_t address_;
  bool present_ = false;
};
