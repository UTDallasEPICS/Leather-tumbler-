const STORAGE_KEY = "sensorhub-settings"
//this code is so that all the user configured sttings are persisted in local storage
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
  demoMode: false,
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

// Cache for tunnel WebSocket URL (loaded once on HTTPS)
let _tunnelWsUrl: string | null = null
let _tunnelWsLoading = false

export function loadTunnelConfig(): void {
  if (typeof window === 'undefined' || window.location.protocol !== 'https:') return
  if (_tunnelWsUrl || _tunnelWsLoading) return
  _tunnelWsLoading = true
  fetch('/tunnel-config.json')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data?.wsUrl) _tunnelWsUrl = data.wsUrl
    })
    .catch(() => {})
    .finally(() => { _tunnelWsLoading = false })
}

export function getWebSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_TARGET === 'pwa' && typeof window !== 'undefined') {
    // When accessed over HTTPS (e.g. Cloudflare tunnel), use tunnel config
    if (window.location.protocol === 'https:' && _tunnelWsUrl) {
      return _tunnelWsUrl
    }
    // Local network: auto-detect from hostname
    return `ws://${window.location.hostname}:8765`
  }
  const { serverIp, serverPort } = getSettings()
  return `ws://${serverIp}:${serverPort}`
}

export function getShellyBaseUrl(): string | null {
  const { shellyIp } = getSettings()
  return shellyIp ? `http://${shellyIp}` : null
}
