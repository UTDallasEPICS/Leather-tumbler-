#pragma once
#include <Arduino.h>

#define LOG(fmt, ...) Serial.printf("[%8lu] " fmt "\n", (unsigned long)millis(), ##__VA_ARGS__)
