#pragma once
// Sensor interfaces. The rest of the firmware only ever sees these two, so a different probe
// (or a simulated one) is a new class plus one line in HardwareFactory, nothing else.

#include <Arduino.h>

class ITemperatureSensor {
 public:
  virtual ~ITemperatureSensor() {}
  virtual bool begin() = 0;           // true if the sensor was found
  virtual bool read(float& celsius) = 0;  // false = no valid reading this time
  virtual const char* name() const = 0;
  virtual bool present() const = 0;
};

class IPhSensor {
 public:
  virtual ~IPhSensor() {}
  virtual bool begin() = 0;
  virtual bool read(float& ph) = 0;
  virtual const char* name() const = 0;
  virtual bool present() const = 0;
};
