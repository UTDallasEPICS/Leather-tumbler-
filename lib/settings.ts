//settings management for the app.

const STORAGE_KEY = "sensorhub-settings"

export interface Settings {
  serverIp: string
  serverPort: number
  shellyIp: string
  shellyDirectEnabled: boolean
  demoMode: boolean
  /** leather inspection server (vision/service.py), usually a laptop on the same Wi-Fi */
  visionIp: string
  visionPort: number
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
    visionIp: inferServerIp(),
    visionPort: 8770,
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

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"]

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const configured = localStorage.getItem("dava-api-origin")
    if (configured) return `${configured}/api`
    // Served over HTTPS on the default port (an ngrok tunnel to the Pi): the backend
    // serves the pages too, so the API is on this same origin, not on :8765.
    // localhost is excluded because that is the Android app's own origin.
    const { protocol, port, hostname, origin } = window.location
    if (protocol === "https:" && port === "" && !LOCAL_HOSTS.includes(hostname)) return `${origin}/api`
  }
  const { serverIp, serverPort } = getSettings()
  const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "https" : "http"
  return `${protocol}://${serverIp}:${serverPort}/api`
}

export function getVisionOrigin(): string {
  const { visionIp, visionPort } = getSettings()
  return `http://${visionIp}:${visionPort}`
}

export function getShellyBaseUrl(): string | null {
  const { shellyIp } = getSettings()
  return shellyIp ? `http://${shellyIp}` : null
}
