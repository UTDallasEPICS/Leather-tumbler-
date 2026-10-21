#include "OtpService.h"

#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "../core/Log.h"

static uint64_t nowMs() { return (uint64_t)(esp_timer_get_time() / 1000ULL); }

static String urlEncode(const String& s) {
  static const char* hex = "0123456789ABCDEF";
  String out;
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
      out += c;
    } else {
      out += '%';
      out += hex[((uint8_t)c) >> 4];
      out += hex[((uint8_t)c) & 0x0F];
    }
  }
  return out;
}

void OtpService::configure(const AppConfig& cfg) {
  mode_ = cfg.otpMode;
  mode_.toLowerCase();
  sid_ = cfg.twilioSid;
  token_ = cfg.twilioToken;
  from_ = cfg.twilioFrom;
  ttlSeconds_ = cfg.otpTtlSeconds;
  length_ = constrain(cfg.otpLength, 4, 9);
}

String OtpService::generateCode() const {
  uint32_t modulus = 1;
  for (uint8_t i = 0; i < length_; i++) modulus *= 10;
  uint32_t n = esp_random() % modulus;  // hardware RNG
  String s(n);
  while (s.length() < length_) s = "0" + s;
  return s;
}

void OtpService::store(const String& phone, const String& code) {
  Guard g(m_);
  uint64_t now = nowMs();
  // drop expired codes first (the old backend's cleanup_old_otps)
  for (size_t i = entries_.size(); i-- > 0;) {
    if (entries_[i].expiresAtMs <= now) entries_.erase(entries_.begin() + i);
  }
  if (entries_.size() >= 8) entries_.erase(entries_.begin());
  entries_.push_back({phone, code, now + (uint64_t)ttlSeconds_ * 1000ULL});
}

bool OtpService::verifyAndConsume(const String& phone, const String& code) {
  Guard g(m_);
  uint64_t now = nowMs();
  for (size_t i = entries_.size(); i-- > 0;) {
    const Entry& e = entries_[i];
    if (e.phone == phone && e.code == code && e.expiresAtMs > now) {
      entries_.erase(entries_.begin() + i);
      return true;
    }
  }
  return false;
}

struct SmsJob {
  String sid, token, from, to, body;
};

static void smsTask(void* arg) {
  SmsJob* job = static_cast<SmsJob*>(arg);

  WiFiClientSecure client;
  client.setInsecure();  // no certificate pinning; the code is short-lived and single-use
  HTTPClient http;
  String url = "https://api.twilio.com/2010-04-01/Accounts/" + job->sid + "/Messages.json";
  if (http.begin(client, url)) {
    http.setAuthorization(job->sid.c_str(), job->token.c_str());
    http.addHeader("Content-Type", "application/x-www-form-urlencoded");
    http.setTimeout(10000);
    String form = "To=" + urlEncode(job->to) + "&From=" + urlEncode(job->from) + "&Body=" + urlEncode(job->body);
    int code = http.POST(form);
    if (code == 200 || code == 201) {
      LOG("otp: SMS sent");
    } else {
      LOG("otp: Twilio returned HTTP %d", code);
    }
    http.end();
  } else {
    LOG("otp: could not start Twilio request");
  }

  delete job;
  vTaskDelete(nullptr);
}

bool OtpService::sendSmsAsync(const String& phone, const String& code) {
  if (!smsConfigured()) return false;
  SmsJob* job = new SmsJob{sid_, token_, from_, phone,
                           "DAVA PIN reset code: " + code + ". It expires in " + String(ttlSeconds_ / 60) + " minutes."};
  if (xTaskCreate(smsTask, "sms", 10240, job, 1, nullptr) != pdPASS) {
    delete job;
    return false;
  }
  return true;
}
