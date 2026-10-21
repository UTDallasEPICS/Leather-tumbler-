//settings management for the app.

const STORAGE_KEY = "sensorhub-settings"

export interface Settings {
  serverIp: string
  serverPort: number
  shellyIp: string
  shellyDirectEnabled: boolean
  demoMode: boolean
}

function inferServerIp(): string {
  if (typeof window === "undefined") return "localhost"
  const host = window.location.hostname
  return host && host !== "" ? host : "localhost"
}

function getDefaults(): Settings {
  return {
    serverIp: inferServerIp(),
    serverPort: 8765,
    shellyIp: "",
    shellyDirectEnabled: false,
    demoMode: true,
  }
}

export function getSettings(): Settings {
  const defaults = getDefaults()
  if (typeof window === "undefined") return defaults
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function getWebSocketUrl(): string {
  return getApiBaseUrl().replace(/^http/, "ws").replace(/\/api$/, "/ws")
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const configured = localStorage.getItem("dava-api-origin")
    if (configured) return `${configured}/api`
  }
  const { serverIp, serverPort } = getSettings()
  const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "https" : "http"
  return `${protocol}://${serverIp}:${serverPort}/api`
}

export function getShellyBaseUrl(): string | null {
  const { shellyIp } = getSettings()
  return shellyIp ? `http://${shellyIp}` : null
}
