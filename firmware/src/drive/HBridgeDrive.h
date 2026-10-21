#pragma once
// DC gearmotor through a dual-PWM H-bridge (BTS7960 style: RPWM = forward, LPWM = reverse).
// Hardware PWM (LEDC), so speed is steady no matter what the CPU is doing.

#include "../core/Log.h"
#include "IDrive.h"
#include "PwmChannel.h"

class HBridgeDrive : public IDrive {
 public:
  HBridgeDrive(int forwardPin, int reversePin, int enablePin, uint32_t pwmHz, int defaultSpeed)
      : fwdPin_(forwardPin), revPin_(reversePin), enPin_(enablePin), pwmHz_(pwmHz) {
    speed_ = constrain(defaultSpeed, 0, 100);
  }

  const char* type() const override { return "hbridge"; }

  bool begin() override {
    if (fwdPin_ < 0 || revPin_ < 0) return false;
    if (enPin_ >= 0) {
      pinMode(enPin_, OUTPUT);
      digitalWrite(enPin_, HIGH);
    }
    fwd_.begin(fwdPin_, 0, pwmHz_);
    rev_.begin(revPin_, 1, pwmHz_);
    return stop();
  }

  bool start() override {
    running_ = true;
    apply();
    LOG("drive(hbridge): ON %s %d%%", forward_ ? "forward" : "reverse", speed_);
    return true;
  }

  bool stop() override {
    running_ = false;
    apply();
    LOG("drive(hbridge): OFF");
    return true;
  }

  DriveStatus status() override {
    DriveStatus s;
    s.on = running_;
    s.source = "gpio";
    return s;
  }

  bool supportsSpeed() const override { return true; }
  bool supportsDirection() const override { return true; }

  bool setSpeed(int percent) override {
    speed_ = constrain(percent, 0, 100);
    if (running_) apply();
    return true;
  }

  bool setDirection(bool forward) override {
    if (forward_ == forward) return true;
    // Release both sides briefly so the bridge never reverses a spinning motor in one step.
    if (running_) {
      fwd_.write(0);
      rev_.write(0);
      delay(250);
    }
    forward_ = forward;
    if (running_) apply();
    return true;
  }

  int speed() const override { return speed_; }
  bool forward() const override { return forward_; }

 private:
  void apply() {
    uint32_t duty = running_ ? (uint32_t)(speed_ * 255 / 100) : 0;
    fwd_.write(forward_ ? duty : 0);
    rev_.write(forward_ ? 0 : duty);
  }

  PwmChannel fwd_;
  PwmChannel rev_;
  int fwdPin_;
  int revPin_;
  int enPin_;
  uint32_t pwmHz_;
  int speed_ = 100;
  bool forward_ = true;
  bool running_ = false;
};
