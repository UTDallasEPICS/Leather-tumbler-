#pragma once
// Whatever turns the drum on and off. The API layer only talks to this interface, so the Shelly
// relay, a plain GPIO relay and a PWM H-bridge are interchangeable (chosen by config).

#include <Arduino.h>

// Matches the app's RelayStatus: { output, source, error? }
struct DriveStatus {
  bool on = false;
  const char* source = "mock";  // mock | gpio | shelly | cached
  bool error = false;
};

class IDrive {
 public:
  virtual ~IDrive() {}

  virtual const char* type() const = 0;
  virtual bool begin() { return true; }  // must leave the drum stopped
  virtual bool start() = 0;              // true if the drive confirmed the command
  virtual bool stop() = 0;
  virtual DriveStatus status() = 0;

  // Optional capabilities. Drives that can't do these just say so.
  virtual bool supportsSpeed() const { return false; }
  virtual bool supportsDirection() const { return false; }
  virtual bool setSpeed(int percent) {
    (void)percent;
    return false;
  }
  virtual bool setDirection(bool forward) {
    (void)forward;
    return false;
  }
  virtual int speed() const { return 100; }
  virtual bool forward() const { return true; }
};
