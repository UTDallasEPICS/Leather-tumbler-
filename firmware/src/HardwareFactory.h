#pragma once
// The one place that turns config into hardware drivers. To support a new probe or motor driver:
// write the class, add one branch here. Nothing else in the firmware changes.

#include <memory>
#include "core/Config.h"
#include "core/Log.h"
#include "drive/GpioRelayDrive.h"
#include "drive/HBridgeDrive.h"
#include "drive/IDrive.h"
#include "drive/MockDrive.h"
#include "drive/PwmDirDrive.h"
#include "drive/ShellyDrive.h"
#include "sensors/Ads1115PhSensor.h"
#include "sensors/Ds18b20Sensor.h"
#include "sensors/MockSensors.h"
#include "sensors/Sensors.h"

struct Hardware {
  std::unique_ptr<ITemperatureSensor> temperature;
  std::unique_ptr<IPhSensor> ph;
  std::unique_ptr<IDrive> drive;
};

inline Hardware buildHardware(const AppConfig& cfg) {
  Hardware hw;

  if (cfg.mockHardware) {
    hw.temperature.reset(new MockTemperatureSensor());
    hw.ph.reset(new MockPhSensor());
    hw.drive.reset(new MockDrive());
  } else {
    hw.temperature.reset(new Ds18b20Sensor(cfg.oneWirePin));
    hw.ph.reset(new Ads1115PhSensor(cfg.sdaPin, cfg.sclPin, cfg.adsAddress));

    if (cfg.driveType == "shelly" && cfg.shellyIp.length() > 0) {
      hw.drive.reset(new ShellyDrive(cfg.shellyIp));
    } else if (cfg.driveType == "relay") {
      hw.drive.reset(new GpioRelayDrive(cfg.relayPin, cfg.relayActiveHigh));
    } else if (cfg.driveType == "hbridge") {
      hw.drive.reset(new HBridgeDrive(cfg.hbForwardPin, cfg.hbReversePin, cfg.hbEnablePin, cfg.pwmFrequency,
                                      cfg.defaultSpeed));
    } else if (cfg.driveType == "pwmdir") {
      hw.drive.reset(new PwmDirDrive(cfg.mdPwmPin, cfg.mdDirPin, cfg.pwmFrequency, cfg.defaultSpeed));
    } else {
      if (cfg.driveType != "mock") LOG("drive '%s' is not usable with this config, using mock", cfg.driveType.c_str());
      hw.drive.reset(new MockDrive());
    }
  }

  bool tempOk = hw.temperature->begin();
  bool phOk = hw.ph->begin();
  bool driveOk = hw.drive->begin();
  LOG("temperature sensor (%s): %s", hw.temperature->name(), tempOk ? "found" : "NOT FOUND");
  LOG("pH sensor (%s): %s", hw.ph->name(), phOk ? "found" : "NOT FOUND");
  LOG("drive (%s): %s", hw.drive->type(), driveOk ? "ready" : "NOT READY");
  return hw;
}
