#pragma once
// Wall-clock timestamps for readings. Uses SNTP when the Wi-Fi has internet; on an isolated LAN
// it falls back to "time since boot" so the app still receives a valid ISO string.

#include <Arduino.h>
#include <esp_sntp.h>
#include <sys/time.h>
#include <time.h>

class Clock {
 public:
  void begin(const String& posixTz) {
    configTzTime(posixTz.c_str(), "pool.ntp.org", "time.google.com", "time.cloudflare.com");
  }

  bool synced() const { return time(nullptr) > 1700000000; }
  bool ntpSynced() const { return sntp_get_sync_status() == SNTP_SYNC_STATUS_COMPLETED; }

  // With no internet (hotspot mode) the phone supplies the time instead. Internet time wins.
  bool setFromClient(uint64_t epochMs) {
    if (ntpSynced() || epochMs < 1700000000000ULL) return false;
    struct timeval tv;
    tv.tv_sec = (time_t)(epochMs / 1000ULL);
    tv.tv_usec = (suseconds_t)((epochMs % 1000ULL) * 1000ULL);
    return settimeofday(&tv, nullptr) == 0;
  }

  const char* source() const { return ntpSynced() ? "ntp" : (synced() ? "app" : "none"); }

  // "2026-10-14T15:20:01": local time, no offset (the app parses it as local time).
  String iso() const {
    struct tm tmv;
    if (synced()) {
      time_t now = time(nullptr);
      localtime_r(&now, &tmv);
    } else {
      time_t up = (time_t)(millis() / 1000);
      gmtime_r(&up, &tmv);
    }
    char buf[24];
    strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%S", &tmv);
    return String(buf);
  }
};
