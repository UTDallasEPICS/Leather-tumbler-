#pragma once
// Optional first-boot defaults. Copy this file to secrets.h (git-ignored) and fill it in.
// Anything saved later through the setup portal is stored in flash and takes priority.

#define DEFAULT_WIFI_SSID ""
#define DEFAULT_WIFI_PASS ""

// Only needed if OTP mode is "twilio" (SMS for the Forgot-PIN flow).
#define DEFAULT_TWILIO_SID ""
#define DEFAULT_TWILIO_TOKEN ""
#define DEFAULT_TWILIO_FROM ""
