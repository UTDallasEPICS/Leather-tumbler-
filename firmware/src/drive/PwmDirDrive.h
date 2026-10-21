#pragma once
// Motor driver with one PWM input and one direction input (sign-magnitude): Cytron MD20A, MD13S
// and similar. PWM sets speed, DIR sets direction.
//
// On these boards PWM = 0 *brakes* the motor, so a hard stop would slam the gearbox and slosh the
// drum. A small background task ramps the duty up and down (about 0.8 s end to end) and only
// flips DIR once the motor has stopped. It runs on its own task, so it stays smooth even while
// loop() is busy reading the temperature probe.

#include "../core/Log.h"
#include "IDrive.h"
#include "PwmChannel.h"

class PwmDirDrive : public IDrive {
 public:
  PwmDirDrive(int pwmPin, int dirPin, uint32_t pwmHz, int defaultSpeed)
      : pwmPin_(pwmPin), dirPin_(dirPin), pwmHz_(pwmHz) {
    speed_ = constrain(defaultSpeed, 0, 100);
  }

  ~PwmDirDrive() override {
    if (task_) vTaskDelete(task_);
  }

  const char* type() const override { return "pwmdir"; }

  bool begin() override {
    if (pwmPin_ < 0 || dirPin_ < 0) return false;
    pinMode(dirPin_, OUTPUT);
    digitalWrite(dirPin_, HIGH);
    pwm_.begin(pwmPin_, 0, pwmHz_);
    pwm_.write(0);
    running_ = false;
    return xTaskCreate(&PwmDirDrive::taskEntry, "drive", 3072, this, 2, &task_) == pdPASS;
  }

  bool start() override {
    running_ = true;
    LOG("drive(pwmdir): ON %s %d%%", desiredForward_ ? "forward" : "reverse", speed_);
    return true;
  }

  bool stop() override {
    running_ = false;
    LOG("drive(pwmdir): OFF (ramping down)");
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
    return true;
  }

  bool setDirection(bool forward) override {
    desiredForward_ = forward;  // the task waits for the motor to stop, then flips DIR
    return true;
  }

  int speed() const override { return speed_; }
  bool forward() const override { return desiredForward_; }

 private:
  static constexpr int kTickMs = 20;
  static constexpr int kRampMs = 800;
  static constexpr int kStep = (255 * kTickMs / kRampMs) > 0 ? (255 * kTickMs / kRampMs) : 1;

  static void taskEntry(void* self) { static_cast<PwmDirDrive*>(self)->run(); }

  void run() {
    for (;;) {
      int target = running_ ? (speed_ * 255 / 100) : 0;

      if (desiredForward_ != appliedForward_) {
        target = 0;  // bring the motor to rest before reversing
        if (current_ == 0) {
          appliedForward_ = desiredForward_;
          digitalWrite(dirPin_, appliedForward_ ? HIGH : LOW);
        }
      }

      if (current_ < target) current_ = min(target, current_ + kStep);
      else if (current_ > target) current_ = max(target, current_ - kStep);

      pwm_.write((uint32_t)current_);
      vTaskDelay(pdMS_TO_TICKS(kTickMs));
    }
  }

  PwmChannel pwm_;
  int pwmPin_;
  int dirPin_;
  uint32_t pwmHz_;
  TaskHandle_t task_ = nullptr;

  // written by web handlers, read by the ramp task
  volatile int speed_ = 100;
  volatile bool running_ = false;
  volatile bool desiredForward_ = true;
  // owned by the ramp task
  int current_ = 0;
  bool appliedForward_ = true;
};
