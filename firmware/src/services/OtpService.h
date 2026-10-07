#pragma once
// One-time codes for the Forgot-PIN flow.
//   mock   : the code is returned in the API response (shown in the app as "Test OTP").
//   twilio : the code is texted through Twilio; the response never contains it.
// Codes live in RAM only and expire after otpTtlSeconds.

#include <Arduino.h>
#include <vector>
#include "../core/Config.h"
#include "../core/Mutex.h"

class OtpService {
 public:
  void configure(const AppConfig& cfg);

  bool useMock() const { return mode_ != "twilio"; }
  bool smsConfigured() const { return !useMock() && sid_.length() && token_.length() && from_.length(); }

  String generateCode() const;
  void store(const String& phone, const String& code);
  bool verifyAndConsume(const String& phone, const String& code);

  // Fire-and-forget: the TLS call to Twilio takes seconds, too long to block a web handler.
  bool sendSmsAsync(const String& phone, const String& code);

 private:
  struct Entry {
    String phone;
    String code;
    uint64_t expiresAtMs;
  };

  Mutex m_;
  std::vector<Entry> entries_;
  String mode_ = "mock";
  String sid_, token_, from_;
  uint32_t ttlSeconds_ = 300;
  uint8_t length_ = 6;
};
