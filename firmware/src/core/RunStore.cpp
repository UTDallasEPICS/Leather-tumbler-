#include "RunStore.h"

#include <LittleFS.h>
#include <algorithm>
#include "Log.h"

namespace {

const char* const kDir = "/runs";
// a run that clashes with the tumbler's active run on import (same text as the Python backend)
const char* const kClashReason = "Started on another device";

String pathOf(const char* id, const char* ext) { return String(kDir) + "/" + id + ext; }

void copyStr(char* dst, size_t n, const char* src) {
  strncpy(dst, src ? src : "", n - 1);
  dst[n - 1] = 0;
}

bool parseStatus(const char* s, RunStatus& out) {
  if (!s) return false;
  if (!strcmp(s, "active")) out = RunStatus::Active;
  else if (!strcmp(s, "completed")) out = RunStatus::Completed;
  else if (!strcmp(s, "overridden")) out = RunStatus::Overridden;
  else return false;
  return true;
}

int64_t sortTime(const RunMeta& m) { return m.endedAt ? m.endedAt : m.startedAt; }

}  // namespace

void RunStore::Agg::add(float v) {
  if (!n) min = max = v;
  n++;
  sum += v;
  sumSq += (double)v * v;
  min = std::min(min, v);
  max = std::max(max, v);
}

bool RunStore::validId(const char* id) {
  size_t n = id ? strlen(id) : 0;
  if (n < 1 || n > 40) return false;
  for (size_t i = 0; i < n; i++)
    if (!isalnum((unsigned char)id[i]) && id[i] != '_' && id[i] != '-') return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// startup
// ---------------------------------------------------------------------------------------------

bool RunStore::begin() {
  Guard g(m_);
  // formats the data partition the first time (it was never used before runs were kept here)
  if (!LittleFS.begin(true)) {
    LOG("runs: no filesystem, runs can't be kept on this controller");
    return false;
  }
  if (!LittleFS.exists(kDir)) LittleFS.mkdir(kDir);

  JsonDocument filter;
  for (const char* k : {"id", "tumblerId", "status", "rev", "seq", "startedAt", "endedAt", "stageId"}) filter[k] = true;

  std::vector<String> leftovers;
  File dir = LittleFS.open(kDir);
  for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
    String path = f.path();
    // a .tmp is a write cut short by a power cut; the .json beside it is the last good copy
    if (!path.endsWith(".json")) {
      leftovers.push_back(path);
      continue;
    }
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, f, DeserializationOption::Filter(filter));
    if (err || !validId(doc["id"] | "")) {
      LOG("runs: skipping unreadable %s (%s)", path.c_str(), err.c_str());
      continue;
    }
    RunMeta m{};
    fill(m, doc.as<JsonObjectConst>());
    index_.push_back(m);
    seq_ = std::max(seq_, m.seq);
  }
  dir.close();
  for (const String& p : leftovers) LittleFS.remove(p);

  ready_ = true;
  lastFlush_ = millis();
  LOG("runs: %u kept, %u of %u KB used", (unsigned)index_.size(), (unsigned)(LittleFS.usedBytes() / 1024),
      (unsigned)(LittleFS.totalBytes() / 1024));
  return true;
}

// ---------------------------------------------------------------------------------------------
// writes from the app
// ---------------------------------------------------------------------------------------------

RunResult RunStore::create(JsonObject run, uint64_t now) {
  Guard g(m_);
  if (!ready_) return {RunWrite::Storage};
  if (const char* err = problem(run)) return {RunWrite::Bad, err};
  if (strcmp(run["status"] | "", "active")) return {RunWrite::Bad, "a new run must be active"};

  char id[41];
  copyStr(id, sizeof id, run["id"]);
  RunResult r{RunWrite::Ok};
  if (find(id)) {
    r.code = RunWrite::Exists;
    readLocked(id, r.stored);
    return r;
  }
  if (RunMeta* active = activeFor(run["tumblerId"].as<int32_t>())) {
    r.code = RunWrite::ActiveRun;
    readLocked(active->id, r.stored);
    return r;
  }

  run["sensors"].to<JsonObject>();
  stamp(run, 1, now);
  if (!writeFile(id, run)) return {RunWrite::Storage};
  RunMeta m{};
  fill(m, run);
  index_.push_back(m);
  r.change = {id, m.rev, m.seq};
  return r;
}

RunResult RunStore::save(const String& id, JsonObject run, uint32_t baseRev, uint64_t now) {
  Guard g(m_);
  if (!ready_) return {RunWrite::Storage};
  if (const char* err = problem(run)) return {RunWrite::Bad, err};
  if (id != (run["id"] | "")) return {RunWrite::Bad, "id mismatch"};

  RunMeta* m = find(id.c_str());
  if (!m) return {RunWrite::NotFound};
  RunResult r{RunWrite::Ok};
  if (m->status != RunStatus::Active || baseRev != m->rev) {
    r.code = m->status != RunStatus::Active ? RunWrite::Final : RunWrite::Stale;
    readLocked(m->id, r.stored);
    return r;
  }
  if (run["tumblerId"].as<int32_t>() != m->tumblerId) return {RunWrite::Bad, "tumblerId can't change"};

  // the readings are the controller's own: keep the stored totals and add what's been counted since
  JsonDocument stored;
  if (!readSensors(m->id, stored)) return {RunWrite::Storage};
  run["sensors"] = stored["sensors"];
  foldSensors(m->id, run);
  stamp(run, m->rev + 1, now);
  if (!writeFile(m->id, run)) return {RunWrite::Storage};

  pending_.erase(std::remove_if(pending_.begin(), pending_.end(), [&](const PendingStage& p) { return id == p.runId; }), pending_.end());
  fill(*m, run);
  r.change = {id, m->rev, m->seq};
  if (m->status != RunStatus::Active) trim();
  return r;
}

RunResult RunStore::overrideRun(const String& id, const char* reason, uint64_t now, JsonDocument& out) {
  Guard g(m_);
  if (!ready_) return {RunWrite::Storage};
  RunMeta* m = find(id.c_str());
  if (!m) return {RunWrite::NotFound};
  RunResult r{RunWrite::Ok};
  if (m->status != RunStatus::Active) {
    r.code = RunWrite::Final;
    readLocked(m->id, r.stored);
    return r;
  }

  File f = LittleFS.open(pathOf(m->id, ".json"), "r");
  DeserializationError err = f ? deserializeJson(out, f) : DeserializationError::InvalidInput;
  f.close();
  if (err) return {RunWrite::Storage};

  JsonObject run = out.as<JsonObject>();
  run["status"] = "overridden";
  run["overrideReason"] = String(reason);
  run["endedAt"] = now;
  foldSensors(m->id, run);
  stamp(run, m->rev + 1, now);
  if (!writeFile(m->id, run)) return {RunWrite::Storage};

  pending_.erase(std::remove_if(pending_.begin(), pending_.end(), [&](const PendingStage& p) { return id == p.runId; }), pending_.end());
  fill(*m, run);
  r.change = {id, m->rev, m->seq};
  trim();
  return r;
}

void RunStore::import(JsonArray runs, uint64_t now, JsonArray imported, JsonArray skipped, std::vector<RunChange>& changes) {
  Guard g(m_);
  if (!ready_) return;
  for (JsonObject run : runs) {
    char id[41];
    copyStr(id, sizeof id, run["id"] | "");
    if (problem(run) || find(id)) {
      skipped.add(String(id));
      continue;
    }
    if (!strcmp(run["status"] | "", "active") && activeFor(run["tumblerId"].as<int32_t>())) {
      run["status"] = "overridden";
      run["overrideReason"] = kClashReason;
      run["endedAt"] = now;
    }
    // the device's own totals are all there is for a run from before the controller kept it
    if (!run["sensors"].is<JsonObject>()) run["sensors"].to<JsonObject>();
    stamp(run, 1, now);
    if (!writeFile(id, run)) {
      skipped.add(String(id));
      continue;
    }
    RunMeta m{};
    fill(m, run);
    index_.push_back(m);
    imported.add(String(id));
    changes.push_back({id, m.rev, m.seq});
  }
  trim();
}

// ---------------------------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------------------------

uint32_t RunStore::changedSince(uint32_t since, size_t limit, std::vector<String>& ids, bool& more) {
  Guard g(m_);
  std::vector<const RunMeta*> list;
  for (const RunMeta& m : index_)
    if (m.seq > since) list.push_back(&m);
  std::sort(list.begin(), list.end(), [](const RunMeta* a, const RunMeta* b) { return a->seq < b->seq; });
  more = list.size() > limit;
  if (more) list.resize(limit);
  for (const RunMeta* m : list) ids.push_back(m->id);
  return more ? list.back()->seq : seq_;
}

uint32_t RunStore::latestSeq() {
  Guard g(m_);
  return seq_;
}

bool RunStore::read(const String& id, String& out) {
  Guard g(m_);
  return readLocked(id.c_str(), out);
}

// ---------------------------------------------------------------------------------------------
// readings
// ---------------------------------------------------------------------------------------------

void RunStore::addReading(const char* key, float value) {
  Guard g(m_);
  bool temp = !strcmp(key, "temp");
  for (const RunMeta& m : index_) {
    if (m.status != RunStatus::Active || !m.stageId[0]) continue;
    auto it = std::find_if(pending_.begin(), pending_.end(),
                           [&](const PendingStage& p) { return !strcmp(p.runId, m.id) && !strcmp(p.stageId, m.stageId); });
    if (it == pending_.end()) {
      pending_.emplace_back();
      it = pending_.end() - 1;
      copyStr(it->runId, sizeof it->runId, m.id);
      copyStr(it->stageId, sizeof it->stageId, m.stageId);
    }
    (temp ? it->temp : it->ph).add(value);
  }
}

void RunStore::flushSensorsIfDue(uint64_t now, std::vector<RunChange>& changes) {
  Guard g(m_);
  if (!ready_ || pending_.empty() || millis() - lastFlush_ < SENSOR_FLUSH_MS) return;
  lastFlush_ = millis();

  std::vector<String> ids;
  for (const PendingStage& p : pending_)
    if (std::find(ids.begin(), ids.end(), p.runId) == ids.end()) ids.push_back(p.runId);

  for (const String& id : ids) {
    auto mine = [&](const PendingStage& p) { return id == p.runId; };
    RunMeta* m = find(id.c_str());
    if (!m || m->status != RunStatus::Active) {
      pending_.erase(std::remove_if(pending_.begin(), pending_.end(), mine), pending_.end());
      continue;
    }
    JsonDocument doc;
    File f = LittleFS.open(pathOf(m->id, ".json"), "r");
    DeserializationError err = f ? deserializeJson(doc, f) : DeserializationError::InvalidInput;
    f.close();
    if (err) continue;  // keep the totals for the next try

    JsonObject run = doc.as<JsonObject>();
    foldSensors(m->id, run);
    // rev stays: new readings don't make an app's pending save stale
    run["updatedAt"] = now;
    run["seq"] = ++seq_;
    if (!writeFile(m->id, run)) continue;
    pending_.erase(std::remove_if(pending_.begin(), pending_.end(), mine), pending_.end());
    m->seq = seq_;
    changes.push_back({id, m->rev, m->seq});
  }
}

// ---------------------------------------------------------------------------------------------
// helpers (called with m_ held)
// ---------------------------------------------------------------------------------------------

RunMeta* RunStore::find(const char* id) {
  for (RunMeta& m : index_)
    if (!strcmp(m.id, id)) return &m;
  return nullptr;
}

RunMeta* RunStore::activeFor(int32_t tumblerId) {
  for (RunMeta& m : index_)
    if (m.tumblerId == tumblerId && m.status == RunStatus::Active) return &m;
  return nullptr;
}

const char* RunStore::problem(JsonObjectConst run) {
  if (run.isNull()) return "missing run";
  if (!validId(run["id"] | "")) return "bad id";
  if (!run["tumblerId"].is<int32_t>()) return "bad tumblerId";
  RunStatus s;
  if (!parseStatus(run["status"] | "", s)) return "bad status";
  if (measureJson(run) > MAX_DOC_BYTES) return "run too large";
  return nullptr;
}

void RunStore::fill(RunMeta& m, JsonObjectConst run) {
  copyStr(m.id, sizeof m.id, run["id"] | "");
  m.tumblerId = run["tumblerId"] | 0;
  parseStatus(run["status"] | "", m.status);
  m.rev = run["rev"] | 0u;
  m.seq = run["seq"] | 0u;
  m.startedAt = run["startedAt"].as<int64_t>();
  m.endedAt = run["endedAt"].as<int64_t>();
  copyStr(m.stageId, sizeof m.stageId, run["stageId"] | "");
}

void RunStore::stamp(JsonObject run, uint32_t rev, uint64_t now) {
  run["rev"] = rev;
  run["seq"] = ++seq_;
  run["updatedAt"] = now;
}

/** Adds a stage's new totals to the stored ones: {n, sum, sumSq, min, max}, like the app's Agg. */
static void mergeAgg(JsonObject stage, const char* key, uint32_t n, double sum, double sumSq, float lo, float hi) {
  if (!n) return;
  JsonObject o = stage[key];
  uint32_t had = o.isNull() ? 0 : (o["n"] | 0u);
  if (!had) {
    o = stage[key].to<JsonObject>();
    o["n"] = n;
    o["sum"] = sum;
    o["sumSq"] = sumSq;
    o["min"] = lo;
    o["max"] = hi;
    return;
  }
  o["n"] = had + n;
  o["sum"] = (o["sum"] | 0.0) + sum;
  o["sumSq"] = (o["sumSq"] | 0.0) + sumSq;
  o["min"] = std::min(o["min"] | lo, lo);
  o["max"] = std::max(o["max"] | hi, hi);
}

void RunStore::foldSensors(const char* runId, JsonObject run) {
  JsonObject sensors = run["sensors"].is<JsonObject>() ? run["sensors"].as<JsonObject>() : run["sensors"].to<JsonObject>();
  for (const PendingStage& p : pending_) {
    if (strcmp(p.runId, runId)) continue;
    String stageKey(p.stageId);
    JsonObject stage = sensors[stageKey].is<JsonObject>() ? sensors[stageKey].as<JsonObject>() : sensors[stageKey].to<JsonObject>();
    mergeAgg(stage, "temp", p.temp.n, p.temp.sum, p.temp.sumSq, p.temp.min, p.temp.max);
    mergeAgg(stage, "ph", p.ph.n, p.ph.sum, p.ph.sumSq, p.ph.min, p.ph.max);
  }
}

bool RunStore::readSensors(const char* id, JsonDocument& into) {
  JsonDocument filter;
  filter["sensors"] = true;
  File f = LittleFS.open(pathOf(id, ".json"), "r");
  if (!f) return false;
  DeserializationError err = deserializeJson(into, f, DeserializationOption::Filter(filter));
  f.close();
  return !err;
}

bool RunStore::readLocked(const char* id, String& out) {
  File f = LittleFS.open(pathOf(id, ".json"), "r");
  if (!f) return false;
  out = "";
  out.reserve(f.size());
  char buf[512];
  while (f.available()) {
    size_t n = f.read((uint8_t*)buf, sizeof buf);
    if (!n) break;
    out.concat(buf, n);
  }
  f.close();
  return out.length() > 0;
}

bool RunStore::writeFile(const char* id, JsonVariantConst doc) {
  String tmp = pathOf(id, ".tmp");
  String dst = pathOf(id, ".json");
  File f = LittleFS.open(tmp, "w");
  if (!f) return false;
  size_t n = serializeJson(doc, f);
  bool ok = n > 0 && !f.getWriteError();
  f.close();
  if (!ok) {
    LittleFS.remove(tmp);
    LOG("runs: writing %s failed (flash full?)", id);
    return false;
  }
  if (LittleFS.rename(tmp, dst)) return true;
  // a filesystem that won't rename over an existing file: replace it in two steps
  LittleFS.remove(dst);
  return LittleFS.rename(tmp, dst);
}

void RunStore::trim() {
  std::vector<const RunMeta*> finished;
  for (const RunMeta& m : index_)
    if (m.status != RunStatus::Active) finished.push_back(&m);
  std::sort(finished.begin(), finished.end(), [](const RunMeta* a, const RunMeta* b) { return sortTime(*a) > sortTime(*b); });

  // copy the ids out first: removing from the index moves the entries the pointers refer to
  std::vector<String> drop, oldest;
  for (size_t i = FINISHED_KEPT; i < finished.size(); i++) drop.push_back(finished[i]->id);
  for (size_t i = std::min(finished.size(), FINISHED_KEPT); i-- > 0;) oldest.push_back(finished[i]->id);

  auto remove = [&](const String& id) {
    LittleFS.remove(pathOf(id.c_str(), ".json"));
    index_.erase(std::remove_if(index_.begin(), index_.end(), [&](const RunMeta& m) { return id == m.id; }), index_.end());
  };
  for (const String& id : drop) remove(id);

  // big runs could fill the flash before the count is reached: make room from the oldest
  for (const String& id : oldest) {
    if (LittleFS.usedBytes() <= LittleFS.totalBytes() * 85 / 100) break;
    LOG("runs: flash nearly full, removing run %s", id.c_str());
    remove(id);
  }
}
