"use client"

export const PIN_STORAGE_KEY = "dava_app_pin"
export const DEFAULT_PIN = "0000"

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

export function getStoredPin(): string {
  if (typeof window === "undefined") return DEFAULT_PIN

  const existing = localStorage.getItem(PIN_STORAGE_KEY)
  if (existing && isValidPin(existing)) return existing

  localStorage.setItem(PIN_STORAGE_KEY, DEFAULT_PIN)
  return DEFAULT_PIN
}

export function verifyPin(candidate: string): boolean {
  return getStoredPin() === candidate
}

export function updateStoredPin(nextPin: string): void {
  if (!isValidPin(nextPin)) {
    throw new Error("PIN must be exactly 4 digits.")
  }
  localStorage.setItem(PIN_STORAGE_KEY, nextPin)
}
