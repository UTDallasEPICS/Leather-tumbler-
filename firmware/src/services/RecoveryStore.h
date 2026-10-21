#pragma once
// The registered recovery phone, kept in flash.

#include <Arduino.h>
#include <Preferences.h>
#include "../core/Mutex.h"

class RecoveryStore {
 public:
  String get() {
    Guard g(m_);
    Preferences p;
    p.begin("dava", false);
    String s = p.getString("phone", "");
    p.end();
    s.trim();
    return s;
  }

  void set(const String& phone) {
    Guard g(m_);
    Preferences p;
    p.begin("dava", false);
    p.putString("phone", phone);
    p.end();
  }

 private:
  Mutex m_;
};
