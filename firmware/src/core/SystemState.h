#pragma once
// "Is a run active, and how many cycles so far". Cycles survive a reboot; active never does
// (the controller always boots stopped).

#include <Arduino.h>
#include <Preferences.h>
#include "Mutex.h"

struct StateSnapshot {
  bool active;
  int cycles;
};

class SystemState {
 public:
  void begin() {
    Preferences p;
    p.begin("dava", false);
    cycles_ = p.getInt("cycles", 0);
    p.end();
    active_ = false;
  }

  StateSnapshot snapshot() {
    Guard g(m_);
    return {active_, cycles_};
  }

  void setActive(bool a) {
    Guard g(m_);
    active_ = a;
  }

  void resetCycles() { setCycles(0); }

  void setCycles(int c) {
    Guard g(m_);
    cycles_ = c;
    Preferences p;
    p.begin("dava", false);
    p.putInt("cycles", cycles_);
    p.end();
  }

 private:
  Mutex m_;
  bool active_ = false;
  int cycles_ = 0;
};
