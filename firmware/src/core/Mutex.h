#pragma once
// Tiny FreeRTOS mutex wrapper. The web server callbacks run on a different task than loop(),
// so anything they share (state, readings, OTP codes) is guarded.

#include <Arduino.h>

class Mutex {
 public:
  Mutex() : h_(xSemaphoreCreateMutex()) {}
  ~Mutex() { vSemaphoreDelete(h_); }
  Mutex(const Mutex&) = delete;
  Mutex& operator=(const Mutex&) = delete;
  void lock() { xSemaphoreTake(h_, portMAX_DELAY); }
  void unlock() { xSemaphoreGive(h_); }

 private:
  SemaphoreHandle_t h_;
};

class Guard {
 public:
  explicit Guard(Mutex& m) : m_(m) { m_.lock(); }
  ~Guard() { m_.unlock(); }
  Guard(const Guard&) = delete;
  Guard& operator=(const Guard&) = delete;

 private:
  Mutex& m_;
};
