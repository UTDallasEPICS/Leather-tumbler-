#pragma once
// One hardware PWM output (ESP32 LEDC). Hides the API difference between Arduino-ESP32 2.x and 3.x.

#include <Arduino.h>

class PwmChannel {
 public:
  void begin(int pin, int channel, uint32_t frequencyHz, int resolutionBits = 8) {
    pin_ = pin;
    channel_ = channel;
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcAttach(pin, frequencyHz, resolutionBits);
#else
    ledcSetup(channel, frequencyHz, resolutionBits);
    ledcAttachPin(pin, channel);
#endif
  }

  void write(uint32_t duty) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcWrite(pin_, duty);
#else
    ledcWrite(channel_, duty);
#endif
  }

 private:
  int pin_ = -1;
  int channel_ = 0;
};
