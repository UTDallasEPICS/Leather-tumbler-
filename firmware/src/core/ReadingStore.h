#pragma once
// Replaces the SQLite readings tables: two fixed-size ring buffers kept in RAM. History is lost on
// reboot, which matches how the app uses it (it only hydrates the last ~100 rows on connect).

#include <Arduino.h>
#include <ArduinoJson.h>
#include "Mutex.h"

struct Reading {
  uint32_t id = 0;
  float value = 0;
  char ts[20] = {0};  // "YYYY-MM-DDTHH:MM:SS"
};

template <size_t N>
class Ring {
 public:
  void push(const Reading& r) {
    buf_[head_] = r;
    head_ = (head_ + 1) % N;
    if (count_ < N) count_++;
  }
  void clear() {
    head_ = 0;
    count_ = 0;
  }
  size_t size() const { return count_; }
  // i = 0 is the newest entry
  const Reading& newest(size_t i) const { return buf_[(head_ + N - 1 - i) % N]; }

 private:
  Reading buf_[N];
  size_t head_ = 0;
  size_t count_ = 0;
};

class ReadingStore {
 public:
  static constexpr size_t CAPACITY = 200;

  Reading addTemperature(float v, const String& ts) { return add(temp_, nextTempId_, v, ts); }
  Reading addPh(float v, const String& ts) { return add(ph_, nextPhId_, v, ts); }

  void clear() {
    Guard g(m_);
    temp_.clear();
    ph_.clear();  // ids keep counting up, like SQLite AUTOINCREMENT
  }

  // {"temperature":[{id,temperature,timestamp}...],"ph":[{id,ph,timestamp}...]}, newest first
  void history(size_t limit, JsonDocument& doc) {
    Guard g(m_);
    JsonArray t = doc["temperature"].to<JsonArray>();
    for (size_t i = 0; i < temp_.size() && i < limit; i++) {
      const Reading& r = temp_.newest(i);
      JsonObject o = t.add<JsonObject>();
      o["id"] = r.id;
      o["temperature"] = r.value;
      o["timestamp"] = r.ts;
    }
    JsonArray p = doc["ph"].to<JsonArray>();
    for (size_t i = 0; i < ph_.size() && i < limit; i++) {
      const Reading& r = ph_.newest(i);
      JsonObject o = p.add<JsonObject>();
      o["id"] = r.id;
      o["ph"] = r.value;
      o["timestamp"] = r.ts;
    }
  }

 private:
  Reading add(Ring<CAPACITY>& ring, uint32_t& nextId, float v, const String& ts) {
    Guard g(m_);
    Reading r;
    r.id = nextId++;
    r.value = v;
    strncpy(r.ts, ts.c_str(), sizeof(r.ts) - 1);
    ring.push(r);
    return r;
  }

  Mutex m_;
  Ring<CAPACITY> temp_;
  Ring<CAPACITY> ph_;
  uint32_t nextTempId_ = 1;
  uint32_t nextPhId_ = 1;
};
