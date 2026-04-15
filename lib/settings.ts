//settings management for the app.

const STORAGE_KEY = "sensorhub-settings"

export interface Settings {
  serverIp: string
  serverPort: number
  shellyIp: string
  shellyDirectEnabled: boolean
  demoMode: boolean
}

const DEFAULTS: Settings = {
  serverIp: "localhost",
  serverPort: 8765,
  shellyIp: "",
  shellyDirectEnabled: false,
  demoMode: true,
}

export function getSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return DEFAULTS
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function getWebSocketUrl(): string {
  const { serverIp, serverPort } = getSettings()
  return `ws://${serverIp}:${serverPort}`
}

export function getShellyBaseUrl(): string | null {
  const { shellyIp } = getSettings()
  return shellyIp ? `http://${shellyIp}` : null
}
