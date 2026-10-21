#pragma once
// Everything the API and the sensor loop need, passed by reference instead of through globals.

#include "HardwareFactory.h"
#include "core/Clock.h"
#include "core/Config.h"
#include "core/ReadingStore.h"
#include "core/SystemState.h"
#include "services/OtpService.h"
#include "services/RecoveryStore.h"

struct AppContext {
  AppConfig& cfg;
  SystemState& state;
  ReadingStore& store;
  Clock& clock;
  Hardware& hw;
  OtpService& otp;
  RecoveryStore& recovery;
};
