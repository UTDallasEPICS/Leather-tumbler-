#include "ApiServer.h"

#include <AsyncJson.h>
#include <WiFi.h>
#include <memory>
#include "../core/Log.h"
#include "../services/Phone.h"
#include "WifiService.h"

ApiServer::ApiServer(AppContext& ctx) : c_(ctx), server_(ctx.cfg.port), ws_("/ws") {}

// Which controller this is (from the chip's MAC), so the app never mixes two controllers' runs.
static String controllerId() {
  char buf[24];
  snprintf(buf, sizeof buf, "esp32-%012llx", (unsigned long long)ESP.getEfuseMac());
  return buf;
}

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

void ApiServer::sendJson(AsyncWebServerRequest* req, int code, const JsonDocument& doc) {
  AsyncResponseStream* res = req->beginResponseStream("application/json");
  res->setCode(code);
  serializeJson(doc, *res);
  req->send(res);
}

void ApiServer::sendMessage(AsyncWebServerRequest* req, int code, bool success, const char* message) {
  JsonDocument doc;
  doc["success"] = success;
  doc["message"] = message;
  sendJson(req, code, doc);
}

void ApiServer::fillState(JsonDocument& doc) {
  StateSnapshot s = c_.state.snapshot();
  doc["active"] = s.active;
  doc["cycles"] = s.cycles;
}

String ApiServer::stateFrame() {
  JsonDocument doc;
  doc["type"] = "system_state";
  fillState(doc);
  String out;
  serializeJson(doc, out);
  return out;
}

void ApiServer::fillMotor(JsonVariant doc) {
  IDrive& d = *c_.hw.drive;
  DriveStatus s = d.status();
  doc["type"] = d.type();
  doc["running"] = s.on;
  doc["speed"] = d.speed();
  doc["direction"] = d.forward() ? "forward" : "reverse";
  doc["supportsSpeed"] = d.supportsSpeed();
  doc["supportsDirection"] = d.supportsDirection();
}

void ApiServer::broadcastState() { ws_.textAll(stateFrame()); }

void ApiServer::broadcastReading(const char* type, const Reading& r) {
  JsonDocument doc;
  doc["type"] = type;
  doc["id"] = r.id;
  doc["value"] = r.value;
  doc["timestamp"] = r.ts;
  String out;
  serializeJson(doc, out);
  ws_.textAll(out);
}

// ---------------------------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------------------------

void ApiServer::setupCors() {
  // The app is served from another origin (the Android shell, or a browser tab), so every
  // response carries CORS headers and OPTIONS preflights are answered here.
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Private-Network", "true");
  DefaultHeaders::Instance().addHeader("Access-Control-Max-Age", "600");

  server_.onNotFound([](AsyncWebServerRequest* req) {
    if (req->method() == HTTP_OPTIONS) {
      req->send(204);
    } else {
      req->send(404, "application/json", "{\"detail\":\"Not Found\"}");
    }
  });
}

void ApiServer::begin() {
  setupCors();

  ws_.onEvent([this](AsyncWebSocket*, AsyncWebSocketClient* client, AwsEventType type, void*, uint8_t*, size_t) {
    if (type == WS_EVT_CONNECT) {
      LOG("ws: client connected (%u total)", (unsigned)ws_.count());
      client->text(stateFrame());  // like the old /ws: current state first, then live frames
    } else if (type == WS_EVT_DISCONNECT) {
      LOG("ws: client disconnected (%u remaining)", (unsigned)ws_.count());
    }
    // client frames are ignored: the socket is broadcast-only
  });
  server_.addHandler(&ws_);

  routeSystem();
  routeMotor();
  routeReadings();
  routeRecovery();
  routeAuth();
  routeRuns();
  routeStatusPage();

  server_.begin();
  LOG("api: listening on port %u", (unsigned)c_.cfg.port);
}

void ApiServer::loop() { ws_.cleanupClients(); }

// ---------------------------------------------------------------------------------------------
// /api/system
// ---------------------------------------------------------------------------------------------

void ApiServer::handleDrive(AsyncWebServerRequest* req, bool on) {
  bool ok = on ? c_.hw.drive->start() : c_.hw.drive->stop();
  // Only record what actually happened: if the drive didn't confirm, the app sees success=false
  // and (if enabled) falls back to switching the Shelly directly.
  if (ok) c_.state.setActive(on);

  JsonDocument doc;
  doc["success"] = ok;
  JsonObject st = doc["state"].to<JsonObject>();
  StateSnapshot s = c_.state.snapshot();
  st["active"] = s.active;
  st["cycles"] = s.cycles;
  sendJson(req, 200, doc);

  if (ok) broadcastState();
  LOG("api: %s -> %s", on ? "start" : "stop", ok ? "ok" : "drive did not confirm");
}

void ApiServer::routeSystem() {
  server_.on("/api/system/state", HTTP_GET, [this](AsyncWebServerRequest* req) {
    JsonDocument doc;
    fillState(doc);
    sendJson(req, 200, doc);
  });

  server_.on("/api/system/start", HTTP_POST, [this](AsyncWebServerRequest* req) { handleDrive(req, true); });
  server_.on("/api/system/stop", HTTP_POST, [this](AsyncWebServerRequest* req) { handleDrive(req, false); });

  server_.on("/api/system/reset-cycles", HTTP_POST, [this](AsyncWebServerRequest* req) {
    c_.state.resetCycles();
    JsonDocument doc;
    doc["success"] = true;
    JsonObject st = doc["state"].to<JsonObject>();
    StateSnapshot s = c_.state.snapshot();
    st["active"] = s.active;
    st["cycles"] = s.cycles;
    sendJson(req, 200, doc);
    broadcastState();
  });

  server_.on("/api/system/clear-logs", HTTP_POST, [this](AsyncWebServerRequest* req) {
    c_.store.clear();
    JsonDocument doc;
    doc["success"] = true;
    sendJson(req, 200, doc);
    ws_.textAll("{\"type\":\"logs_cleared\"}");
  });

  // The app tells us the time when it connects, because a hotspot-mode controller has no internet.
  auto* timeSet = new AsyncCallbackJsonWebHandler("/api/system/time", [this](AsyncWebServerRequest* req, JsonVariant& json) {
    uint64_t ms = json["epochMs"] | (uint64_t)0;
    bool set = c_.clock.setFromClient(ms);
    JsonDocument doc;
    doc["success"] = true;
    doc["applied"] = set;
    doc["source"] = c_.clock.source();
    sendJson(req, 200, doc);
  });
  timeSet->setMethod(HTTP_POST);
  server_.addHandler(timeSet);

  server_.on("/api/system/relay-status", HTTP_GET, [this](AsyncWebServerRequest* req) {
    DriveStatus s = c_.hw.drive->status();
    JsonDocument doc;
    doc["output"] = s.on;
    doc["source"] = s.source;
    if (s.error) doc["error"] = true;
    sendJson(req, 200, doc);
  });

  server_.on("/api/system/info", HTTP_GET, [this](AsyncWebServerRequest* req) {
    JsonDocument doc;
    doc["controllerId"] = controllerId();
    doc["firmware"] = DAVA_FW_VERSION;
    doc["runsAvailable"] = c_.runs.ready();
    doc["hostname"] = c_.cfg.hostname;
    doc["ip"] = deviceIp();
    doc["rssi"] = WiFi.RSSI();
    doc["uptimeSeconds"] = (uint32_t)(millis() / 1000);
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["timeSynced"] = c_.clock.synced();
    doc["timeSource"] = c_.clock.source();
    doc["mockHardware"] = c_.cfg.mockHardware;
    JsonObject sensors = doc["sensors"].to<JsonObject>();
    JsonObject t = sensors["temperature"].to<JsonObject>();
    t["driver"] = c_.hw.temperature->name();
    t["present"] = c_.hw.temperature->present();
    JsonObject p = sensors["ph"].to<JsonObject>();
    p["driver"] = c_.hw.ph->name();
    p["present"] = c_.hw.ph->present();
    JsonObject drive = doc["drive"].to<JsonObject>();
    fillMotor(drive);
    sendJson(req, 200, doc);
  });
}

// ---------------------------------------------------------------------------------------------
// optional motor controls (speed / direction)
// ---------------------------------------------------------------------------------------------

void ApiServer::routeMotor() {
  server_.on("/api/system/motor-status", HTTP_GET, [this](AsyncWebServerRequest* req) {
    JsonDocument doc;
    fillMotor(doc);
    sendJson(req, 200, doc);
  });

  auto* speed = new AsyncCallbackJsonWebHandler("/api/system/speed", [this](AsyncWebServerRequest* req, JsonVariant& json) {
    if (!c_.hw.drive->supportsSpeed()) {
      sendMessage(req, 400, false, "This drive does not support speed control.");
      return;
    }
    int percent = json["percent"] | -1;
    if (percent < 0 || percent > 100) {
      sendMessage(req, 400, false, "percent must be 0 to 100.");
      return;
    }
    c_.hw.drive->setSpeed(percent);
    JsonDocument doc;
    fillMotor(doc);
    sendJson(req, 200, doc);
  });
  speed->setMethod(HTTP_POST);
  server_.addHandler(speed);

  auto* direction = new AsyncCallbackJsonWebHandler("/api/system/direction", [this](AsyncWebServerRequest* req, JsonVariant& json) {
    if (!c_.hw.drive->supportsDirection()) {
      sendMessage(req, 400, false, "This drive does not support direction control.");
      return;
    }
    String dir = json["direction"] | "";
    if (dir != "forward" && dir != "reverse") {
      sendMessage(req, 400, false, "direction must be 'forward' or 'reverse'.");
      return;
    }
    c_.hw.drive->setDirection(dir == "forward");
    JsonDocument doc;
    fillMotor(doc);
    sendJson(req, 200, doc);
  });
  direction->setMethod(HTTP_POST);
  server_.addHandler(direction);
}

// ---------------------------------------------------------------------------------------------
// /api/readings
// ---------------------------------------------------------------------------------------------

void ApiServer::routeReadings() {
  server_.on("/api/readings/history", HTTP_GET, [this](AsyncWebServerRequest* req) {
    long limit = 100;
    if (req->hasParam("limit")) limit = req->getParam("limit")->value().toInt();
    limit = constrain(limit, 1L, (long)ReadingStore::CAPACITY);
    JsonDocument doc;
    c_.store.history((size_t)limit, doc);
    sendJson(req, 200, doc);
  });
}

// ---------------------------------------------------------------------------------------------
// /api/recovery
// ---------------------------------------------------------------------------------------------

void ApiServer::routeRecovery() {
  server_.on("/api/recovery/phone", HTTP_GET, [this](AsyncWebServerRequest* req) {
    JsonDocument doc;
    doc["success"] = true;
    doc["phone"] = c_.recovery.get();
    sendJson(req, 200, doc);
  });

  auto* put = new AsyncCallbackJsonWebHandler("/api/recovery/phone", [this](AsyncWebServerRequest* req, JsonVariant& json) {
    String p = phone::normalize(json["phone"] | "");
    if (!phone::isValid(p)) {
      sendMessage(req, 400, false, "Invalid phone number format. Use country code, e.g. +15551234567.");
      return;
    }
    c_.recovery.set(p);
    JsonDocument doc;
    doc["success"] = true;
    doc["message"] = "Recovery phone registered.";
    doc["phone"] = p;
    sendJson(req, 200, doc);
  });
  put->setMethod(HTTP_PUT);
  server_.addHandler(put);
}

// ---------------------------------------------------------------------------------------------
// /api/auth (PIN reset OTP)
// ---------------------------------------------------------------------------------------------

void ApiServer::routeAuth() {
  auto* request = new AsyncCallbackJsonWebHandler("/api/auth/otp/request", [this](AsyncWebServerRequest* req, JsonVariant& json) {
    String p = phone::normalize(json["phone"] | "");
    if (!phone::isValid(p)) {
      sendMessage(req, 400, false, "Invalid phone number.");
      return;
    }
    String registered = c_.recovery.get();
    if (registered.length() == 0) {
      sendMessage(req, 400, false, "No recovery phone registered. Set it in Account first.");
      return;
    }
    if (!phone::matches(p, registered)) {
      sendMessage(req, 400, false, "Phone number is not registered.");
      return;
    }

    String code = c_.otp.generateCode();
    JsonDocument doc;
    if (c_.otp.useMock()) {
      c_.otp.store(p, code);
      doc["success"] = true;
      doc["message"] = "OTP sent.";
      doc["delivery"] = "mock";
      doc["debugCode"] = code;  // mock mode only: the app shows it as "Test OTP"
      LOG("otp: mock code issued for %s", p.c_str());
      sendJson(req, 200, doc);
      return;
    }

    if (!c_.otp.smsConfigured()) {
      sendMessage(req, 500, false, "Twilio mode is enabled but credentials are missing.");
      return;
    }
    c_.otp.store(p, code);
    if (!c_.otp.sendSmsAsync(p, code)) {
      sendMessage(req, 502, false, "Failed to send OTP SMS. Check SMS provider config.");
      return;
    }
    doc["success"] = true;
    doc["message"] = "OTP sent.";
    doc["delivery"] = "sms";
    sendJson(req, 200, doc);
  });
  request->setMethod(HTTP_POST);
  server_.addHandler(request);

  auto* verify = new AsyncCallbackJsonWebHandler("/api/auth/otp/verify", [this](AsyncWebServerRequest* req, JsonVariant& json) {
    String p = phone::normalize(json["phone"] | "");
    String code = json["otp"] | "";
    code.trim();
    if (p.length() == 0 || code.length() == 0) {
      sendMessage(req, 400, false, "Phone and OTP are required.");
      return;
    }
    bool ok = c_.otp.verifyAndConsume(p, code);
    sendMessage(req, 200, ok, ok ? "OTP verified." : "Invalid or expired OTP.");
  });
  verify->setMethod(HTTP_POST);
  server_.addHandler(verify);
}

// ---------------------------------------------------------------------------------------------
// /api/runs (shared run history; same JSON and rules as backend/routers/runs.py)
// ---------------------------------------------------------------------------------------------

namespace {

/** A list of runs sent piece by piece, straight from their files, so 200 runs never sit in RAM at once. */
struct RunList {
  String head;
  std::vector<String> ids;
  size_t next = 0;
  bool anyRun = false;
  uint8_t part = 0;  // 0 head, 1 runs, 2 tail, 3 done
  String piece;
  size_t pos = 0;

  bool load(RunStore& store) {
    pos = 0;
    if (part == 0) {
      piece = head;
      part = 1;
      return true;
    }
    while (part == 1 && next < ids.size()) {
      String doc;
      // a run trimmed since the list was made is simply left out
      if (!store.read(ids[next++], doc)) continue;
      piece = anyRun ? "," : "";
      piece += doc;
      anyRun = true;
      return true;
    }
    if (part == 1) {
      piece = "]}";
      part = 2;
      return true;
    }
    return false;
  }

  size_t fill(RunStore& store, uint8_t* buf, size_t maxLen) {
    size_t n = 0;
    while (n < maxLen) {
      if (pos >= piece.length() && !load(store)) break;
      size_t take = std::min(maxLen - n, (size_t)(piece.length() - pos));
      memcpy(buf + n, piece.c_str() + pos, take);
      n += take;
      pos += take;
    }
    return n;
  }
};

}  // namespace

void ApiServer::broadcastRun(const RunChange& change) {
  char buf[120];
  snprintf(buf, sizeof buf, "{\"type\":\"run_updated\",\"id\":\"%s\",\"rev\":%u,\"seq\":%u}", change.id.c_str(), (unsigned)change.rev,
           (unsigned)change.seq);
  ws_.textAll(buf);
}

void ApiServer::sendRun(AsyncWebServerRequest* req, int code, JsonVariantConst run) {
  AsyncResponseStream* res = req->beginResponseStream("application/json");
  res->setCode(code);
  res->print("{\"run\":");
  serializeJson(run, *res);
  res->printf(",\"serverNow\":%llu}", (unsigned long long)c_.clock.nowMs());
  req->send(res);
}

void ApiServer::sendRunError(AsyncWebServerRequest* req, int code, const char* error, const String& stored) {
  AsyncResponseStream* res = req->beginResponseStream("application/json");
  res->setCode(code);
  res->printf("{\"error\":\"%s\"", error);
  if (stored.length()) {
    res->print(",\"run\":");
    res->print(stored);
  }
  res->printf(",\"serverNow\":%llu}", (unsigned long long)c_.clock.nowMs());
  req->send(res);
}

void ApiServer::replyRun(AsyncWebServerRequest* req, const RunResult& r, JsonVariantConst run, int okCode) {
  switch (r.code) {
    case RunWrite::Ok:
      sendRun(req, okCode, run);
      broadcastRun(r.change);
      return;
    case RunWrite::Bad:
      return sendRunError(req, 400, r.error);
    case RunWrite::NotFound:
      return sendRunError(req, 404, "not_found");
    case RunWrite::Exists:
      return sendRunError(req, 409, "exists", r.stored);
    case RunWrite::ActiveRun:
      return sendRunError(req, 409, "active_run", r.stored);
    case RunWrite::Stale:
      return sendRunError(req, 409, "stale", r.stored);
    case RunWrite::Final:
      return sendRunError(req, 409, "final", r.stored);
    case RunWrite::Storage:
      return sendRunError(req, 503, "storage");
  }
}

void ApiServer::routeRuns() {
  server_.on("/api/runs", HTTP_GET, [this](AsyncWebServerRequest* req) {
    if (req->url() != "/api/runs") return sendRunError(req, 404, "not_found");
    if (!c_.runs.ready()) return sendRunError(req, 503, "storage");
    uint32_t since = req->hasParam("since") ? strtoul(req->getParam("since")->value().c_str(), nullptr, 10) : 0;
    long limit = req->hasParam("limit") ? req->getParam("limit")->value().toInt() : 500;
    limit = constrain(limit, 1L, 1000L);

    auto list = std::make_shared<RunList>();
    bool more = false;
    uint32_t seq = c_.runs.changedSince(since, (size_t)limit, list->ids, more);
    char head[96];
    snprintf(head, sizeof head, "{\"seq\":%u,\"more\":%s,\"serverNow\":%llu,\"runs\":[", (unsigned)seq, more ? "true" : "false",
             (unsigned long long)c_.clock.nowMs());
    list->head = head;
    req->send(req->beginChunkedResponse("application/json",
                                        [this, list](uint8_t* buf, size_t maxLen, size_t) { return list->fill(c_.runs, buf, maxLen); }));
  });

  // POST /api/runs, POST /api/runs/import, POST /api/runs/<id>/override, PUT /api/runs/<id>
  auto* writes = new AsyncCallbackJsonWebHandler("/api/runs", [this](AsyncWebServerRequest* req, JsonVariant& json) {
    if (!c_.runs.ready()) return sendRunError(req, 503, "storage");
    String path = req->url().substring(strlen("/api/runs"));
    bool post = req->method() == HTTP_POST;
    uint64_t now = c_.clock.nowMs();

    if (post && path.length() == 0) {
      JsonObject run = json["run"].as<JsonObject>();
      return replyRun(req, c_.runs.create(run, now), run, 201);
    }

    if (post && path == "/import") {
      JsonArray runs = json["runs"].as<JsonArray>();
      if (runs.isNull()) return sendRunError(req, 400, "missing runs");
      JsonDocument out;
      JsonArray imported = out["imported"].to<JsonArray>();
      JsonArray skipped = out["skipped"].to<JsonArray>();
      std::vector<RunChange> changes;
      c_.runs.import(runs, now, imported, skipped, changes);
      out["seq"] = c_.runs.latestSeq();
      out["serverNow"] = now;
      sendJson(req, 200, out);
      for (const RunChange& ch : changes) broadcastRun(ch);
      LOG("runs: imported %u", (unsigned)imported.size());
      return;
    }

    if (post && path.startsWith("/") && path.endsWith("/override")) {
      String id = path.substring(1, path.length() - strlen("/override"));
      const char* reason = json["reason"] | "";
      size_t len = strlen(reason);
      if (len < 1 || len > 200) return sendRunError(req, 400, "bad reason");
      JsonDocument out;
      RunResult r = c_.runs.overrideRun(id, reason, now, out);
      replyRun(req, r, out.as<JsonVariantConst>(), 200);
      if (r.code == RunWrite::Ok) LOG("runs: %s overridden", id.c_str());
      return;
    }

    if (!post && path.startsWith("/") && path.indexOf('/', 1) < 0) {
      if (!json["baseRev"].is<uint32_t>()) return sendRunError(req, 400, "missing baseRev");
      JsonObject run = json["run"].as<JsonObject>();
      return replyRun(req, c_.runs.save(path.substring(1), run, json["baseRev"].as<uint32_t>(), now), run, 200);
    }

    sendRunError(req, 404, "not_found");
  });
  writes->setMethod(HTTP_POST | HTTP_PUT);
  // a run is at most 32 KB; leave room for the envelope around it
  writes->setMaxContentLength(RunStore::MAX_DOC_BYTES + 1024);
  server_.addHandler(writes);
}

// ---------------------------------------------------------------------------------------------
// GET /  (a human-readable "is it alive" page; the app itself is the Android app)
// ---------------------------------------------------------------------------------------------

void ApiServer::routeStatusPage() {
  server_.on("/", HTTP_GET, [this](AsyncWebServerRequest* req) {
    String html =
        "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
        "<title>DAVA Tumbler controller</title>"
        "<body style='font-family:system-ui;max-width:32rem;margin:2rem auto;padding:0 1rem'>"
        "<h1>DAVA Leather Tumbler</h1><p>Controller firmware " DAVA_FW_VERSION " is running.</p><ul>"
        "<li><a href='/api/system/state'>/api/system/state</a></li>"
        "<li><a href='/api/system/info'>/api/system/info</a></li>"
        "<li><a href='/api/readings/history?limit=20'>/api/readings/history</a></li></ul>"
        "<p>Open the tumbler app and set <b>Server IP</b> to <b>" +
        deviceIp() + "</b>, port <b>" + String(c_.cfg.port) + "</b> under Connection.</p></body>";
    req->send(200, "text/html", html);
  });
}
