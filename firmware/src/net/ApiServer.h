#pragma once
// HTTP + WebSocket server. Same routes, same JSON, same port as the Python backend it replaces,
// so the app talks to the ESP32 without any change:
//
//   GET  /api/system/state            POST /api/system/start | stop | reset-cycles | clear-logs
//   GET  /api/system/relay-status     GET  /api/readings/history?limit=
//   GET  /api/recovery/phone          PUT  /api/recovery/phone
//   POST /api/auth/otp/request        POST /api/auth/otp/verify
//   WS   /ws   (server push: system_state, temperature, ph, logs_cleared)
//
// New and optional (used once the app grows speed/direction controls):
//   GET /api/system/info   GET /api/system/motor-status
//   POST /api/system/speed {percent}   POST /api/system/direction {direction}

#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>
#include "../AppContext.h"

class ApiServer {
 public:
  explicit ApiServer(AppContext& ctx);

  void begin();
  void loop();  // housekeeping for dead WebSocket clients

  void broadcastState();
  void broadcastReading(const char* type, const Reading& r);

 private:
  void setupCors();
  void routeSystem();
  void routeMotor();
  void routeReadings();
  void routeRecovery();
  void routeAuth();
  void routeStatusPage();

  void handleDrive(AsyncWebServerRequest* req, bool on);
  void fillState(JsonDocument& doc);
  void fillMotor(JsonVariant doc);
  String stateFrame();

  static void sendJson(AsyncWebServerRequest* req, int code, const JsonDocument& doc);
  static void sendMessage(AsyncWebServerRequest* req, int code, bool success, const char* message);

  AppContext& c_;
  AsyncWebServer server_;
  AsyncWebSocket ws_;
};
