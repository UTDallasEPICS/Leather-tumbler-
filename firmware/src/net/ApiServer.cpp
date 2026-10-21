#include "ApiServer.h"

#include <AsyncJson.h>
#include <WiFi.h>
#include "../core/Log.h"
#include "../services/Phone.h"
#include "WifiService.h"

ApiServer::ApiServer(AppContext& ctx) : c_(ctx), server_(ctx.cfg.port), ws_("/ws") {}

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
    doc["firmware"] = DAVA_FW_VERSION;
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
