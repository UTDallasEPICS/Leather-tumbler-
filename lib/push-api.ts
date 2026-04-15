"use client"

import { Capacitor } from "@capacitor/core"

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

export function getSendFcmUrl(): string | null {
  const configuredBase = process.env.NEXT_PUBLIC_PUSH_API_BASE_URL?.trim()

  if (configuredBase) {
    return `${trimTrailingSlash(configuredBase)}/api/send-fcm`
  }

  // Web dev/server mode can use the Next.js relative API route.
  if (Capacitor.getPlatform() === "web") {
    return "/api/send-fcm"
  }

  // Native APK has no built-in Next server when exported statically.
  return null
}
