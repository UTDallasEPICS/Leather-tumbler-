#pragma once
#include "../core/Log.h"
#include "IDrive.h"

// Does nothing but remember its state. Default until a real drive is configured.
class MockDrive : public IDrive {
 public:
  const char* type() const override { return "mock"; }
  bool start() override {
    on_ = true;
    LOG("drive(mock): ON");
    return true;
  }
  bool stop() override {
    on_ = false;
    LOG("drive(mock): OFF");
    return true;
  }
  DriveStatus status() override {
    DriveStatus s;
    s.on = on_;
    s.source = "mock";
    return s;
  }

 private:
  bool on_ = false;
};
