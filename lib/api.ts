import { getApiBaseUrl } from "@/lib/settings"

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

export interface RecoveryPhoneResponse {
  success: boolean
  phone: string
}

export interface RegisterPhoneResponse {
  success: boolean
  message: string
  phone?: string
}

export interface OtpRequestResponse {
  success: boolean
  message: string
  delivery?: "sms" | "mock"
  debugCode?: string | null
}

export interface OtpVerifyResponse {
  success: boolean
  message: string
}

const DEFAULT_TIMEOUT_MS = 10_000

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init
  const url = `${getApiBaseUrl()}${path}`
  const response = await fetch(url, {
    ...rest,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      ...(rest.headers || {}),
    },
  })
  if (!response.ok && response.status >= 500) {
    throw new Error(`Server error ${response.status} for ${path}`)
  }
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

export function getSystemState(): Promise<SystemStateDTO> {
  return request("/system/state", { method: "GET" })
}

export function getHistory(limit = 100): Promise<HistoryResponse> {
  return request(`/readings/history?limit=${limit}`, { method: "GET" })
}

export function getRecoveryPhone(): Promise<RecoveryPhoneResponse> {
  return request("/recovery/phone", { method: "GET" })
}

export function registerRecoveryPhone(phone: string): Promise<RegisterPhoneResponse> {
  return request("/recovery/phone", {
    method: "PUT",
    body: JSON.stringify({ phone }),
  })
}

export function requestPinResetOtp(phone: string): Promise<OtpRequestResponse> {
  return request("/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  })
}

export function verifyPinResetOtp(phone: string, otp: string): Promise<OtpVerifyResponse> {
  return request("/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ phone, otp }),
  })
}
