#include "ConfigPortal.h"

#include <WiFi.h>
#include "../core/Log.h"

static String esc(const String& s) {
  String o;
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '&') o += "&amp;";
    else if (c == '<') o += "&lt;";
    else if (c == '>') o += "&gt;";
    else if (c == '"') o += "&quot;";
    else o += c;
  }
  return o;
}

static String field(const char* label, const char* name, const String& value, const char* type = "text",
                    const char* hint = "") {
  return String("<label>") + label + "<input name='" + name + "' type='" + type + "' value=\"" + esc(value) + "\">" +
         (strlen(hint) ? String("<small>") + hint + "</small>" : String("")) + "</label>";
}

static String option(const char* value, const char* label, const String& current) {
  return String("<option value='") + value + "'" + (current == value ? " selected" : "") + ">" + label + "</option>";
}

String ConfigPortal::page() {
  String h =
      "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
      "<title>Tumbler setup</title><style>"
      "body{font-family:system-ui;max-width:30rem;margin:1.5rem auto;padding:0 1rem;color:#1e1e1e}"
      "h1{font-size:1.4rem}h2{font-size:1.05rem;margin-top:1.6rem}"
      "label{display:block;margin:.7rem 0;font-weight:600;font-size:.9rem}"
      "input,select{display:block;width:100%;box-sizing:border-box;padding:.6rem;margin-top:.25rem;font-size:1rem;"
      "border:1px solid #c9bfb6;border-radius:8px}small{display:block;font-weight:400;color:#6b6560}"
      "button{width:100%;padding:.9rem;margin-top:1.4rem;font-size:1.05rem;font-weight:600;color:#fff;"
      "background:#d22f2f;border:0;border-radius:12px}</style>"
      "<h1>DAVA Tumbler setup</h1><form method=post action=/save>"
      "<h2>Network</h2>";
  h += "<label>How should the controller connect?<select name=mode>";
  h += option("sta", "Join an existing Wi-Fi network", cfg_.hotspot ? "ap" : "sta");
  h += option("ap", "Be the hotspot (phone and Shelly join it, no router needed)", cfg_.hotspot ? "ap" : "sta");
  h += "</select></label>";
  h += "<h2>Existing Wi-Fi</h2>";
  h += "<label>Network<input name=ssid list=nets value=\"" + esc(cfg_.wifiSsid) + "\"><datalist id=nets>" + networks_ +
       "</datalist></label>";
  h += field("Password", "pass", "", "password", "Leave blank to keep the saved password.");

  h += "<h2>Hotspot (when it is the hotspot, address 10.3.141.1)</h2>";
  h += field("Hotspot name", "apSsid", cfg_.apSsid);
  h += field("Hotspot password", "apPass", "", "password", "8+ characters. Leave blank to keep the saved one.");

  h += "<h2>Motor drive</h2><label>Driver<select name=drive>";
  h += option("mock", "None / simulated", cfg_.driveType);
  h += option("shelly", "Shelly Pro 2 relay (Wi-Fi)", cfg_.driveType);
  h += option("relay", "Relay module on a GPIO pin", cfg_.driveType);
  h += option("pwmdir", "Cytron MD20A / MD13S (PWM + DIR pins)", cfg_.driveType);
  h += option("hbridge", "Dual-PWM H-bridge (BTS7960)", cfg_.driveType);
  h += "</select></label>";
  h += field("Shelly IP address", "shellyIp", cfg_.shellyIp, "text", "Only for the Shelly driver.");
  h += field("Relay pin", "relayPin", String(cfg_.relayPin), "number");
  h += "<label>Relay switches ON when pin is<select name=relayHigh>";
  h += String("<option value=1") + (cfg_.relayActiveHigh ? " selected" : "") + ">HIGH</option>";
  h += String("<option value=0") + (!cfg_.relayActiveHigh ? " selected" : "") + ">LOW</option></select></label>";
  h += field("Cytron PWM pin", "mdPwm", String(cfg_.mdPwmPin), "number");
  h += field("Cytron DIR pin", "mdDir", String(cfg_.mdDirPin), "number");
  h += field("H-bridge forward pin (RPWM)", "hbFwd", String(cfg_.hbForwardPin), "number");
  h += field("H-bridge reverse pin (LPWM)", "hbRev", String(cfg_.hbReversePin), "number");
  h += field("H-bridge enable pin", "hbEn", String(cfg_.hbEnablePin), "number", "-1 if R_EN / L_EN are tied to 3V3.");

  h += "<h2>Testing</h2><label><input type=checkbox name=mock value=1 style='display:inline;width:auto;margin-right:.5rem'";
  h += cfg_.mockHardware ? " checked" : "";
  h += ">Use simulated sensors and drive (no hardware needed)</label>";

  h += "<button>Save and restart</button></form>";
  return h;
}

void ConfigPortal::save(AsyncWebServerRequest* req) {
  auto arg = [&](const char* name) { return req->hasArg(name) ? req->arg(name) : String(""); };

  cfg_.hotspot = arg("mode") == "ap";
  String apSsid = arg("apSsid");
  apSsid.trim();
  if (apSsid.length()) cfg_.apSsid = apSsid;
  String apPass = arg("apPass");
  if (apPass.length() >= 8) cfg_.apPass = apPass;

  String ssid = arg("ssid");
  ssid.trim();
  if (ssid.length()) cfg_.wifiSsid = ssid;
  String pass = arg("pass");
  if (pass.length()) cfg_.wifiPass = pass;

  cfg_.driveType = arg("drive").length() ? arg("drive") : cfg_.driveType;
  cfg_.shellyIp = arg("shellyIp");
  cfg_.shellyIp.trim();
  if (arg("relayPin").length()) cfg_.relayPin = (int8_t)arg("relayPin").toInt();
  cfg_.relayActiveHigh = arg("relayHigh") != "0";
  if (arg("mdPwm").length()) cfg_.mdPwmPin = (int8_t)arg("mdPwm").toInt();
  if (arg("mdDir").length()) cfg_.mdDirPin = (int8_t)arg("mdDir").toInt();
  if (arg("hbFwd").length()) cfg_.hbForwardPin = (int8_t)arg("hbFwd").toInt();
  if (arg("hbRev").length()) cfg_.hbReversePin = (int8_t)arg("hbRev").toInt();
  if (arg("hbEn").length()) cfg_.hbEnablePin = (int8_t)arg("hbEn").toInt();
  cfg_.mockHardware = arg("mock") == "1";
  cfg_.save();

  req->send(200, "text/html",
            "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
            "<body style='font-family:system-ui;max-width:30rem;margin:2rem auto;padding:0 1rem'>"
            "<h1>Saved</h1><p>The controller is restarting. Reconnect your phone to the normal Wi-Fi "
            "(or to the controller's hotspot if you chose that), then use the app.</p>");
  restartPending_ = true;
  restartAt_ = millis() + 1500;  // let the response leave before rebooting
}

void ConfigPortal::begin() {
  WiFi.persistent(false);
  WiFi.mode(WIFI_AP_STA);

  int n = WiFi.scanNetworks();
  for (int i = 0; i < n; i++) networks_ += "<option value=\"" + esc(WiFi.SSID(i)) + "\">";
  WiFi.scanDelete();

  WiFi.softAP("DAVA-Tumbler-Setup", "tumbler-setup");
  LOG("portal: join 'DAVA-Tumbler-Setup' (password tumbler-setup), open http://%s", WiFi.softAPIP().toString().c_str());

  server_.on("/", HTTP_GET, [this](AsyncWebServerRequest* req) { req->send(200, "text/html", page()); });
  server_.on("/save", HTTP_POST, [this](AsyncWebServerRequest* req) { save(req); });
  server_.onNotFound([](AsyncWebServerRequest* req) { req->redirect("/"); });
  server_.begin();
}

void ConfigPortal::loop() {
  if (restartPending_ && millis() > restartAt_) {
    LOG("portal: restarting");
    ESP.restart();
  }
}
