#include "Config.h"

#include <Preferences.h>

#if __has_include("secrets.h")
#include "secrets.h"
#endif
#ifndef DEFAULT_WIFI_SSID
#define DEFAULT_WIFI_SSID ""
#endif
#ifndef DEFAULT_WIFI_PASS
#define DEFAULT_WIFI_PASS ""
#endif
#ifndef DEFAULT_TWILIO_SID
#define DEFAULT_TWILIO_SID ""
#endif
#ifndef DEFAULT_TWILIO_TOKEN
#define DEFAULT_TWILIO_TOKEN ""
#endif
#ifndef DEFAULT_TWILIO_FROM
#define DEFAULT_TWILIO_FROM ""
#endif

static const char* NS = "dava";

void AppConfig::load() {
  Preferences p;
  p.begin(NS, false);
  wifiSsid = p.getString("ssid", DEFAULT_WIFI_SSID);
  wifiPass = p.getString("pass", DEFAULT_WIFI_PASS);
  hotspot = p.getBool("ap", hotspot);
  apSsid = p.getString("apSsid", apSsid);
  apPass = p.getString("apPass", apPass);
  hostname = p.getString("host", hostname);
  port = p.getUShort("port", port);
  timezone = p.getString("tz", timezone);

  mockHardware = p.getBool("mock", mockHardware);
  driveType = p.getString("drive", driveType);

  oneWirePin = p.getChar("owPin", oneWirePin);
  sdaPin = p.getChar("sdaPin", sdaPin);
  sclPin = p.getChar("sclPin", sclPin);
  adsAddress = p.getUChar("adsAddr", adsAddress);

  shellyIp = p.getString("shellyIp", shellyIp);
  relayPin = p.getChar("relayPin", relayPin);
  relayActiveHigh = p.getBool("relayHigh", relayActiveHigh);
  hbForwardPin = p.getChar("hbFwd", hbForwardPin);
  hbReversePin = p.getChar("hbRev", hbReversePin);
  hbEnablePin = p.getChar("hbEn", hbEnablePin);
  mdPwmPin = p.getChar("mdPwm", mdPwmPin);
  mdDirPin = p.getChar("mdDir", mdDirPin);
  pwmFrequency = p.getUInt("pwmHz", pwmFrequency);
  defaultSpeed = p.getUChar("speed", defaultSpeed);

  otpMode = p.getString("otpMode", otpMode);
  twilioSid = p.getString("twSid", DEFAULT_TWILIO_SID);
  twilioToken = p.getString("twTok", DEFAULT_TWILIO_TOKEN);
  twilioFrom = p.getString("twFrom", DEFAULT_TWILIO_FROM);
  otpTtlSeconds = p.getUInt("otpTtl", otpTtlSeconds);
  otpLength = p.getUChar("otpLen", otpLength);
  p.end();
}

void AppConfig::save() const {
  Preferences p;
  p.begin(NS, false);
  p.putString("ssid", wifiSsid);
  p.putString("pass", wifiPass);
  p.putBool("ap", hotspot);
  p.putString("apSsid", apSsid);
  p.putString("apPass", apPass);
  p.putString("host", hostname);
  p.putUShort("port", port);
  p.putString("tz", timezone);

  p.putBool("mock", mockHardware);
  p.putString("drive", driveType);

  p.putChar("owPin", oneWirePin);
  p.putChar("sdaPin", sdaPin);
  p.putChar("sclPin", sclPin);
  p.putUChar("adsAddr", adsAddress);

  p.putString("shellyIp", shellyIp);
  p.putChar("relayPin", relayPin);
  p.putBool("relayHigh", relayActiveHigh);
  p.putChar("hbFwd", hbForwardPin);
  p.putChar("hbRev", hbReversePin);
  p.putChar("hbEn", hbEnablePin);
  p.putChar("mdPwm", mdPwmPin);
  p.putChar("mdDir", mdDirPin);
  p.putUInt("pwmHz", pwmFrequency);
  p.putUChar("speed", defaultSpeed);

  p.putString("otpMode", otpMode);
  p.putString("twSid", twilioSid);
  p.putString("twTok", twilioToken);
  p.putString("twFrom", twilioFrom);
  p.putUInt("otpTtl", otpTtlSeconds);
  p.putUChar("otpLen", otpLength);
  p.end();
}

void AppConfig::clearWifi() {
  wifiSsid = "";
  wifiPass = "";
  hotspot = false;
  Preferences p;
  p.begin(NS, false);
  p.remove("ssid");
  p.remove("pass");
  p.remove("ap");
  p.end();
}
