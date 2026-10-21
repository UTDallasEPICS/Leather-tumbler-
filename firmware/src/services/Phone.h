#pragma once
// Phone number normalisation and validation. Direct port of backend/services/phone.py so the
// app's Forgot-PIN flow behaves identically.

#include <Arduino.h>

namespace phone {

inline String digitsOnly(const String& s) {
  String out;
  for (size_t i = 0; i < s.length(); i++) {
    if (isDigit(s[i])) out += s[i];
  }
  return out;
}

inline String normalize(const String& input) {
  String raw = input;
  raw.trim();
  if (raw.length() == 0) return "";

  if (raw.startsWith("00")) raw = "+" + raw.substring(2);

  if (raw.startsWith("+")) {
    String digits = digitsOnly(raw.substring(1));
    return digits.length() ? "+" + digits : "";
  }

  String digits = digitsOnly(raw);
  if (digits.startsWith("1") && digits.length() == 11) return "+" + digits;
  if (digits.startsWith("52") && digits.length() == 12) return "+" + digits;
  return digits;
}

// +1 and 10 digits, +52 and 10 digits, or a bare 10-digit number
inline bool isValid(const String& p) {
  auto allDigits = [](const String& s, size_t from) {
    for (size_t i = from; i < s.length(); i++) {
      if (!isDigit(s[i])) return false;
    }
    return true;
  };
  if (p.startsWith("+1") && p.length() == 12) return allDigits(p, 2);
  if (p.startsWith("+52") && p.length() == 13) return allDigits(p, 3);
  if (p.length() == 10) return allDigits(p, 0);
  return false;
}

inline String last10(const String& p) {
  String d = digitsOnly(p);
  return d.length() > 10 ? d.substring(d.length() - 10) : d;
}

inline bool matches(const String& a, const String& b) {
  if (a == b) return true;
  String x = last10(a);
  String y = last10(b);
  return x.length() && y.length() && x == y;
}

}  // namespace phone
