#pragma once
// All runtime settings in one place. Defaults live here, overrides live in flash (NVS) and are
// written by the setup portal. Hardware choices (pins, drive type) are config, not code, so a
// different wiring or motor driver needs no firmware change.

#include <Arduino.h>

struct AppConfig {
  // --- network ---
  String wifiSsid;
  String wifiPass;
  // Hotspot mode: the ESP32 *is* the network (like the old Pi + RaspAP setup), so the phone and
  // the Shelly join it and no router or internet is needed. Subnet matches RaspAP (10.3.141.x).
  bool hotspot = false;
  String apSsid = "Tumbler-Iot";
  String apPass = "tumbler-iot";  // 8+ characters
  String hostname = "tumbler";                 // reachable as tumbler.local where mDNS works
  uint16_t port = 8765;                        // same port the app already expects
  String timezone = "CST6CDT,M3.2.0,M11.1.0";  // POSIX TZ string (US Central)

  // --- hardware selection ---
  bool mockHardware = false;  // simulated sensors + drive, for bench testing
  String driveType = "mock";  // mock | shelly | relay | hbridge | pwmdir

  // --- sensors ---
  int8_t oneWirePin = 4;  // DS18B20 data (4.7k pull-up to 3V3)
  int8_t sdaPin = 21;     // ADS1115 (pH)
  int8_t sclPin = 22;
  uint8_t adsAddress = 0x48;

  // --- drive: shelly ---
  String shellyIp;
  // --- drive: relay ---
  int8_t relayPin = 27;
  bool relayActiveHigh = true;
  // --- drive: hbridge (PWM speed + direction, e.g. BTS7960) ---
  int8_t hbForwardPin = 25;  // RPWM
  int8_t hbReversePin = 26;  // LPWM
  int8_t hbEnablePin = -1;   // optional R_EN/L_EN, -1 = tie them to 3V3 instead
  // --- drive: pwmdir (one PWM pin + one direction pin, e.g. Cytron MD20A / MD13S) ---
  int8_t mdPwmPin = 25;
  int8_t mdDirPin = 26;
  uint32_t pwmFrequency = 5000;  // shared by hbridge and pwmdir (Cytron boards accept up to 20 kHz)
  uint8_t defaultSpeed = 100;  // percent used by /api/system/start

  // --- recovery / OTP ---
  String otpMode = "mock";  // mock | twilio
  String twilioSid;
  String twilioToken;
  String twilioFrom;
  uint32_t otpTtlSeconds = 300;
  uint8_t otpLength = 6;

  void load();
  void save() const;
  void clearWifi();
  bool hasNetwork() const { return hotspot || wifiSsid.length() > 0; }
};
