#include <driverlib.h>

void setup() {
  Serial.begin(115200);
}

float voltage_to_ph(float v) {
  return 7.0 + (2.5 - v) / 0.18;
}

void loop() {
  int raw = analogRead(A0);
  float voltage = raw * 3.3 / 16384.0; // 14-bit ADC
  float ph = voltage_to_ph(voltage);

  Serial.print("pH: ");
  Serial.println(ph, 3);

  delay(1000);
}