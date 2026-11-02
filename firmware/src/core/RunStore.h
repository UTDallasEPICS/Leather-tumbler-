#pragma once
// Runs, shared by every device that talks to this tumbler. Same rules and JSON as
// backend/routers/runs.py; the contract is written down at the top of lib/runs-api.ts in the app.
//
// One file per run in LittleFS (/runs/<id>.json, written to a .tmp and renamed, so a power cut
// leaves the old copy), and a small index in RAM so lookups never touch the flash. The active
// runs and the newest FINISHED_KEPT finished ones are kept; older ones are deleted.
//
// Readings taken while the drum turns are added up per run and stage in RAM, and written into
// the run every SENSOR_FLUSH_MS and whenever an app saves it.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <vector>
#include "Mutex.h"

enum class RunStatus : uint8_t { Active, Completed, Overridden };

struct RunMeta {
  char id[41];
  int32_t tumblerId;
  RunStatus status;
  uint32_t rev;
  uint32_t seq;
  int64_t startedAt;
  int64_t endedAt;  // 0 while active
  char stageId[24];
};

/** What changed, for the run_updated WebSocket frame. */
struct RunChange {
  String id;
  uint32_t rev;
  uint32_t seq;
};

enum class RunWrite { Ok, Bad, NotFound, Exists, ActiveRun, Stale, Final, Storage };

struct RunResult {
  RunWrite code;
  /** why a request was refused (Bad) */
  const char* error = "";
  /** the stored copy, as JSON text, for the conflicts that send it back */
  String stored;
  RunChange change;
};

class RunStore {
 public:
  static constexpr size_t FINISHED_KEPT = 200;
  static constexpr size_t MAX_DOC_BYTES = 32 * 1024;
  static constexpr uint32_t SENSOR_FLUSH_MS = 5 * 60 * 1000;

  /** Mounts the filesystem and reads the index. false: runs are unavailable (the API answers 503). */
  bool begin();
  bool ready() const { return ready_; }

  // Each takes the run from the request body and changes it in place into the stored document,
  // so the handler can send it back without a second copy in RAM.
  RunResult create(JsonObject run, uint64_t now);
  RunResult save(const String& id, JsonObject run, uint32_t baseRev, uint64_t now);
  RunResult overrideRun(const String& id, const char* reason, uint64_t now, JsonDocument& out);
  /** Ids already stored or malformed are skipped; an active run that clashes is kept as overridden. */
  void import(JsonArray runs, uint64_t now, JsonArray imported, JsonArray skipped, std::vector<RunChange>& changes);

  /** Ids of the runs changed after `since`, oldest change first, at most `limit`. Returns the last
   * change covered; `more` says there are further ones after it. */
  uint32_t changedSince(uint32_t since, size_t limit, std::vector<String>& ids, bool& more);
  uint32_t latestSeq();
  /** The stored JSON text of a run; false if it's gone. */
  bool read(const String& id, String& out);

  /** A reading, added to the current stage of every active run. */
  void addReading(const char* key, float value);
  /** Writes the totals added up since the last flush, if it's time. */
  void flushSensorsIfDue(uint64_t now, std::vector<RunChange>& changes);

  static bool validId(const char* id);

 private:
  struct Agg {
    uint32_t n = 0;
    double sum = 0, sumSq = 0;
    float min = 0, max = 0;
    void add(float v);
  };
  struct PendingStage {
    char runId[41];
    char stageId[24];
    Agg temp, ph;
  };

  RunMeta* find(const char* id);
  RunMeta* activeFor(int32_t tumblerId);
  const char* problem(JsonObjectConst run);
  void fill(RunMeta& m, JsonObjectConst run);
  void stamp(JsonObject run, uint32_t rev, uint64_t now);
  void foldSensors(const char* runId, JsonObject run);
  bool readSensors(const char* id, JsonDocument& into);
  bool readLocked(const char* id, String& out);
  bool writeFile(const char* id, JsonVariantConst doc);
  void trim();

  Mutex m_;
  bool ready_ = false;
  std::vector<RunMeta> index_;
  std::vector<PendingStage> pending_;
  uint32_t seq_ = 0;
  uint32_t lastFlush_ = 0;
};
