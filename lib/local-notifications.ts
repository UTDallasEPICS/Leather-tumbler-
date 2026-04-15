"use client"

import { Capacitor } from "@capacitor/core"
import { LocalNotifications } from "@capacitor/local-notifications"

let permissionChecked = false
let channelsInitialized = false
let nextNotificationId = 1

const HEAT_WARNING_CHANNEL_ID = "dava_warning_heat"
const PH_WARNING_CHANNEL_ID = "dava_warning_ph"
const BOTH_WARNING_CHANNEL_ID = "dava_warning_both"
const WARNING_NOTIFICATION_ID = 909001

export type WarningNotificationKind = "heat" | "ph" | "both"

async function ensurePermission(): Promise<boolean> {
  if (Capacitor.getPlatform() === "web") return false

  if (!permissionChecked) {
    let perms = await LocalNotifications.checkPermissions()
    if (perms.display === "prompt") {
      perms = await LocalNotifications.requestPermissions()
    }
    permissionChecked = perms.display === "granted"
  }

  return permissionChecked
}

async function ensureChannels(): Promise<void> {
  if (Capacitor.getPlatform() === "web" || channelsInitialized) return

  try {
    await LocalNotifications.createChannel({
      id: HEAT_WARNING_CHANNEL_ID,
      name: "Heat Warnings",
      description: "Overheat warning alerts",
      importance: 5,
      vibration: true,
    })
    await LocalNotifications.createChannel({
      id: PH_WARNING_CHANNEL_ID,
      name: "pH Warnings",
      description: "pH warning alerts",
      importance: 5,
      vibration: true,
    })
    await LocalNotifications.createChannel({
      id: BOTH_WARNING_CHANNEL_ID,
      name: "Critical Warnings",
      description: "Combined heat and pH warning alerts",
      importance: 5,
      vibration: true,
    })
    channelsInitialized = true
  } catch (error) {
    // Channel might already exist or fail on some devices; notification can still proceed.
    console.warn("Local notification channel setup warning:", error)
  }
}

export async function sendLocalNotification(title: string, body: string): Promise<void> {
  const allowed = await ensurePermission()
  if (!allowed) return

  await ensureChannels()

  const id = nextNotificationId++
  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title,
        body,
        schedule: { at: new Date(Date.now() + 300) },
      },
    ],
  })
}

export async function startBackgroundWarningAlert(kind: WarningNotificationKind, body: string): Promise<void> {
  const allowed = await ensurePermission()
  if (!allowed) return

  await ensureChannels()

  let channelId = BOTH_WARNING_CHANNEL_ID
  if (kind === "heat") channelId = HEAT_WARNING_CHANNEL_ID
  if (kind === "ph") channelId = PH_WARNING_CHANNEL_ID

  await LocalNotifications.cancel({
    notifications: [{ id: WARNING_NOTIFICATION_ID }],
  })

  await LocalNotifications.schedule({
    notifications: [
      {
        id: WARNING_NOTIFICATION_ID,
        title: "Tumbler Warning",
        body,
        channelId,
        schedule: {
          at: new Date(Date.now() + 800),
          every: "minute",
          allowWhileIdle: true,
        },
      },
    ],
  })
}

export async function stopBackgroundWarningAlert(): Promise<void> {
  if (Capacitor.getPlatform() === "web") return

  await LocalNotifications.cancel({
    notifications: [{ id: WARNING_NOTIFICATION_ID }],
  })
}
