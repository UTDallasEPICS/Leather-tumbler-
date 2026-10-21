import { getApiBaseUrl } from "@/lib/settings"
import { getAccessToken } from "@/lib/session"

export interface SystemStateDTO {
  active: boolean
  cycles: number
}

export interface SystemActionResponse {
  success: boolean
  state: SystemStateDTO
}

export interface ClearLogsResponse {
  success: boolean
}

export interface RelayStatusDTO {
  output?: boolean
  source?: string
  error?: boolean
}

export interface TemperatureReadingDTO {
  id: number
  temperature: number
  timestamp: string
}

export interface PhReadingDTO {
  id: number
  ph: number
  timestamp: string
}

export interface HistoryResponse {
  temperature: TemperatureReadingDTO[]
  ph: PhReadingDTO[]
}

const DEFAULT_TIMEOUT_MS = 10_000

export async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init
  const url = `${getApiBaseUrl()}${path}`
  const token = getAccessToken(getApiBaseUrl())
  const response = await fetch(url, {
    ...rest,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers || {}),
    },
  })
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event("auth-expired"))
    const error = await response.json().catch(() => ({}))
    throw new Error(typeof error.detail === "string" ? error.detail : `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function startSystem(): Promise<SystemActionResponse> {
  return request("/system/start", { method: "POST" })
}

export function stopSystem(): Promise<SystemActionResponse> {
  return request("/system/stop", { method: "POST" })
}

export function resetCycles(): Promise<SystemActionResponse> {
  return request("/system/reset-cycles", { method: "POST" })
}

export function clearLogs(): Promise<ClearLogsResponse> {
  return request("/system/clear-logs", { method: "POST" })
}

export function getRelayStatus(): Promise<RelayStatusDTO> {
  return request("/system/relay-status", { method: "GET" })
}

// The tumbler controller has no internet in hotspot mode, so the phone tells it the time.
export function syncDeviceTime(): Promise<{ success: boolean }> {
  return request("/system/time", { method: "POST", body: JSON.stringify({ epochMs: Date.now() }) })
}

export function getSystemState(): Promise<SystemStateDTO> {
  return request("/system/state", { method: "GET" })
}

export function getHistory(limit = 100): Promise<HistoryResponse> {
  return request(`/readings/history?limit=${limit}`, { method: "GET" })
}
