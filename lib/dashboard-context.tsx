"use client"

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react"
import { getSettings, getWebSocketUrl } from "@/lib/settings"
import { getSendFcmUrl } from "@/lib/push-api"
import * as api from "@/lib/api"
import {
  sendLocalNotification,
  startBackgroundWarningAlert,
  stopBackgroundWarningAlert,
  type WarningNotificationKind,
} from "@/lib/local-notifications"
// 1. IMPORT PUSH NOTIFICATIONS
import { PushNotifications } from '@capacitor/push-notifications'

const genId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? genId()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export interface LogEntry {
  id: string
  timestamp: Date
  temperature: number
  ph: number
}

export interface NotificationLog {
  id: string
  timestamp: Date
  title: string
  body: string
}

export interface Config {
  heatLimit: number
  phLowLimit: number
  phHighLimit: number
  numCycles: number
}

export type ConnectionStatus = "connected" | "connecting" | "disconnected"
export type Status = "Forward" | "Rest" | "Disconnected"

interface DashboardState {
  status: Status
  connectionStatus: ConnectionStatus
  heat: number
  ph: number
  cycles: number
  logs: LogEntry[]
  notificationLogs: NotificationLog[]
  config: Config
  isRunning: boolean
  start: () => Promise<void> | void
  stop: () => Promise<void> | void
  resetCycles: () => void
  clearLogs: () => void
  clearNotificationLogs: () => void
  updateConfig: (config: Config) => void
  reconnect: () => void
  shellyDirectOn: () => Promise<boolean>
  shellyDirectOff: () => Promise<boolean>
}

const DashboardContext = createContext<DashboardState | null>(null)

const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000
const OVERHEAT_WARNING_TEMP = 35
const PH_WARNING_LOW = 6
const PH_WARNING_HIGH = 8
type WarningAudioMode = "none" | "heat" | "ph" | "both"

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [status, setStatus] = useState<Status>("Disconnected")
  const [heat, setHeat] = useState(0.0)
  const [ph, setPh] = useState(7.0)
  const [cycles, setCycles] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([])
  const [config, setConfig] = useState<Config>({ heatLimit: 50, phLowLimit: 5, phHighLimit: 10, numCycles: 10 })
  const [isRunning, setIsRunning] = useState(false)
  const [heatWarningActive, setHeatWarningActive] = useState(false)
  const [phWarningActive, setPhWarningActive] = useState(false)
  const [isAppVisible, setIsAppVisible] = useState(true)

  // FCM & NOTIFICATION REFS
  const [fcmToken, setFcmToken] = useState<string | null>(null)
  const notificationTimerRef = useRef(0)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRef = useRef(config)

  // Demo mode refs
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const demoTempRef = useRef(25.0)
  const demoPhRef = useRef(7.0)
  const isRunningRef = useRef(false)
  const demoCycleCounterRef = useRef(0)
  const overheatWarnedRef = useRef(false)
  const phLowWarnedRef = useRef(false)
  const phHighWarnedRef = useRef(false)
  const killSwitchTriggeredRef = useRef(false)
  const phRef = useRef(ph)
  const heatRef = useRef(heat)
  const airRaidAudioRef = useRef<HTMLAudioElement | null>(null)
  const phSirenAudioRef = useRef<HTMLAudioElement | null>(null)
  const megaHornAudioRef = useRef<HTMLAudioElement | null>(null)
  const currentWarningAudioModeRef = useRef<WarningAudioMode>("none")

  useEffect(() => { configRef.current = config }, [config])
  useEffect(() => { isRunningRef.current = isRunning }, [isRunning])
  useEffect(() => { phRef.current = ph }, [ph])
  useEffect(() => { heatRef.current = heat }, [heat])

  useEffect(() => {
    if (!isRunning) {
      overheatWarnedRef.current = false
      phLowWarnedRef.current = false
      phHighWarnedRef.current = false
      killSwitchTriggeredRef.current = false
      setHeatWarningActive(false)
      setPhWarningActive(false)
    }
  }, [isRunning])

  const stopAllWarningAudio = useCallback(() => {
    const players = [airRaidAudioRef.current, phSirenAudioRef.current, megaHornAudioRef.current]
    players.forEach((player) => {
      if (!player) return
      player.pause()
      player.currentTime = 0
    })
    currentWarningAudioModeRef.current = "none"
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const nextMode: WarningAudioMode = !isRunning
      ? "none"
      : heatWarningActive && phWarningActive
        ? "both"
        : heatWarningActive
          ? "heat"
          : phWarningActive
            ? "ph"
            : "none"

    if (nextMode === currentWarningAudioModeRef.current) return
    stopAllWarningAudio()
    if (nextMode === "none") return

    const getOrCreateAudio = (ref: React.MutableRefObject<HTMLAudioElement | null>, src: string) => {
      if (!ref.current) {
        ref.current = new Audio(src)
        ref.current.loop = true
      } else if (!ref.current.src.includes(src)) {
        ref.current.src = src
      }
      return ref.current
    }

    const selectedAudio =
      nextMode === "both"
        ? getOrCreateAudio(megaHornAudioRef, "/sounds/mega-horn.mp3")
        : nextMode === "heat"
          ? getOrCreateAudio(airRaidAudioRef, "/sounds/air-raid.mp3")
          : getOrCreateAudio(phSirenAudioRef, "/sounds/ph-siren.mp3")

    selectedAudio.play().catch((error) => {
      console.error("Warning audio playback failed:", error)
    })
    currentWarningAudioModeRef.current = nextMode
  }, [heatWarningActive, phWarningActive, isRunning, stopAllWarningAudio])

  useEffect(() => {
    return () => stopAllWarningAudio()
  }, [stopAllWarningAudio])

  useEffect(() => {
    if (typeof document === "undefined") return

    const onVisibilityChange = () => {
      setIsAppVisible(document.visibilityState === "visible")
    }

    onVisibilityChange()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [])

  useEffect(() => {
    const warningMode: WarningNotificationKind | "none" =
      !isRunning
        ? "none"
        : heatWarningActive && phWarningActive
          ? "both"
          : heatWarningActive
            ? "heat"
            : phWarningActive
              ? "ph"
              : "none"

    if (warningMode === "none" || isAppVisible) {
      void stopBackgroundWarningAlert().catch((error) => {
        console.error("Failed to stop background warning alert:", error)
      })
      return
    }

    const body =
      warningMode === "both"
        ? "Heat and pH are in warning range."
        : warningMode === "heat"
          ? "Temperature warning is active."
          : "pH warning is active."

    void startBackgroundWarningAlert(warningMode, body).catch((error) => {
      console.error("Failed to start background warning alert:", error)
    })
  }, [heatWarningActive, phWarningActive, isRunning, isAppVisible])

  // CAPACITOR REGISTRATION EFFECT
  useEffect(() => {
    const initPush = async () => {
      if (typeof window !== 'undefined' && (window as any).Capacitor?.getPlatform() !== 'web') {
        const { addPushListeners, removePushListeners } = await import('@/lib/push-notifications')
        
        addPushListeners(
          (token) => {
            console.log("FCM Token registered:", token)
            setFcmToken(token)
            localStorage.setItem("fcm_token", token)
          },
          (notification) => {
            setNotificationLogs(prev => [
              {
                id: genId(),
                timestamp: new Date(),
                title: notification.title || "Notification",
                body: notification.body || ""
              },
              ...prev.slice(0, 49)
            ])
          },
          (action) => {
            setNotificationLogs(prev => [
              {
                id: genId(),
                timestamp: new Date(),
                title: `[Clicked] ${action.notification.title || "Notification"}`,
                body: action.notification.body || ""
              },
              ...prev.slice(0, 49)
            ])
          }
        )

        return () => {
          removePushListeners()
        }
      }
    }

    initPush()
  }, [])

  // Helper to send push notifications
  const sendPush = useCallback(async (msg: string) => {
    const token = fcmToken || localStorage.getItem("fcm_token")
    if (!token) return
    const sendUrl = getSendFcmUrl()
    if (!sendUrl) {
      console.error("Push API URL not configured. Set NEXT_PUBLIC_PUSH_API_BASE_URL for native builds.")
      return
    }
    try {
      const response = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, message: msg })
      })
      if (!response.ok) {
        const body = await response.text()
        throw new Error(`Push API error (${response.status}): ${body || "unknown error"}`)
      }
    } catch (err) {
      console.error("FCM Send Failed:", err)
    }
  }, [fcmToken])

  const notifyUser = useCallback((msg: string) => {
    setNotificationLogs(prev => [
      {
        id: genId(),
        timestamp: new Date(),
        title: "Tumbler Notification",
        body: msg,
      },
      ...prev.slice(0, 49),
    ])

    void sendLocalNotification("Tumbler Notification", msg).catch((error) => {
      console.error("Local notification failed:", error)
    })

    void sendPush(msg)
  }, [sendPush])

  const maybeNotifyOverheat = useCallback((temperature: number) => {
    if (!isRunningRef.current) {
      overheatWarnedRef.current = false
      setHeatWarningActive(false)
      return
    }

    if (temperature >= OVERHEAT_WARNING_TEMP) {
      setHeatWarningActive(true)
      if (!overheatWarnedRef.current) {
        overheatWarnedRef.current = true
        notifyUser(`Overheating warning: temperature crossed ${OVERHEAT_WARNING_TEMP}°C. Please turn off the tumbler.`)
      }
    } else {
      overheatWarnedRef.current = false
      setHeatWarningActive(false)
    }
  }, [notifyUser])

  const maybeNotifyPhRange = useCallback((phValue: number) => {
    if (!isRunningRef.current) {
      phLowWarnedRef.current = false
      phHighWarnedRef.current = false
      setPhWarningActive(false)
      return
    }

    const isOutOfWarningRange = phValue < PH_WARNING_LOW || phValue > PH_WARNING_HIGH
    setPhWarningActive(isOutOfWarningRange)

    if (phValue < PH_WARNING_LOW) {
      if (!phLowWarnedRef.current) {
        phLowWarnedRef.current = true
        notifyUser(`pH too low: ${phValue.toFixed(2)} (below ${PH_WARNING_LOW.toFixed(2)}).`)
      }
    } else {
      phLowWarnedRef.current = false
    }

    if (phValue > PH_WARNING_HIGH) {
      if (!phHighWarnedRef.current) {
        phHighWarnedRef.current = true
        notifyUser(`pH too high: ${phValue.toFixed(2)} (above ${PH_WARNING_HIGH.toFixed(2)}).`)
      }
    } else {
      phHighWarnedRef.current = false
    }
  }, [notifyUser])

  const maybeApplyKillSwitch = useCallback((temperature: number, phValue: number, isDemo: boolean) => {
    if (!isRunningRef.current || killSwitchTriggeredRef.current) return

    const { heatLimit, phLowLimit, phHighLimit } = configRef.current
    const heatExceeded = temperature >= heatLimit
    const phExceeded = phValue < phLowLimit || phValue > phHighLimit

    if (!heatExceeded && !phExceeded) return

    killSwitchTriggeredRef.current = true

    if (heatExceeded) {
      notifyUser("EMERGENCY STOP: Temperature limit reached")
      alert(`EMERGENCY STOP: Temperature (${temperature}°C) exceeded limit (${heatLimit}°C)!`)
    } else if (phValue < phLowLimit) {
      notifyUser("EMERGENCY STOP: pH low limit reached")
      alert(`EMERGENCY STOP: pH (${phValue.toFixed(2)}) dropped below limit (${phLowLimit.toFixed(2)}).`)
    } else {
      notifyUser("EMERGENCY STOP: pH high limit reached")
      alert(`EMERGENCY STOP: pH (${phValue.toFixed(2)}) exceeded limit (${phHighLimit.toFixed(2)}).`)
    }

    if (isDemo) {
      setIsRunning(false)
      setStatus("Disconnected")
    } else {
      void api.stopSystem().catch((err) => console.error("stopSystem failed:", err))
    }
  }, [notifyUser])

  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case "temperature":
        setHeat(data.value)
        heatRef.current = data.value
        maybeNotifyOverheat(data.value)
        maybeApplyKillSwitch(data.value, phRef.current, false)
        setLogs(prev => [
          {
            id: data.id?.toString() || genId(),
            timestamp: new Date(data.timestamp),
            temperature: data.value,
            ph: phRef.current,
          },
          ...prev.slice(0, 99),
        ])
        break
      case "ph":
        setPh(data.value)
        phRef.current = data.value
        maybeNotifyPhRange(data.value)
        maybeApplyKillSwitch(heatRef.current, data.value, false)
        setLogs(prev => [
          {
            id: data.id?.toString() || genId(),
            timestamp: new Date(data.timestamp),
            temperature: heatRef.current,
            ph: data.value,
          },
          ...prev.slice(0, 99),
        ])
        break
      case "system_state":
        setIsRunning(data.active); setCycles(data.cycles ?? 0); setStatus(data.active ? "Forward" : "Disconnected")
        break
      case "logs_cleared":
        setLogs([])
        break
    }
  }, [maybeNotifyOverheat, maybeNotifyPhRange, maybeApplyKillSwitch])

  // --- Demo mode ---

  const stopDemo = useCallback(() => {
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current)
      demoIntervalRef.current = null
    }
  }, [])

  const startDemo = useCallback(() => {
    if (wsRef.current) wsRef.current.close()
    wsRef.current = null
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    reconnectTimeoutRef.current = null
    stopDemo()

    setConnectionStatus("connected")
    setStatus("Disconnected")
    setIsRunning(false)
    demoTempRef.current = 25.0
    demoPhRef.current = 7.0
    setHeat(25.0)
    setPh(7.0)
    heatRef.current = 25.0
    phRef.current = 7.0
    demoCycleCounterRef.current = 0
    notificationTimerRef.current = 0 // Reset timer

    demoIntervalRef.current = setInterval(() => {
      if (!isRunningRef.current) return

      const tempStep = 0.5
      demoTempRef.current = Math.max(15, Math.min(70, demoTempRef.current + tempStep))
      const temp = Math.round(demoTempRef.current * 100) / 100
      const phStep = 0.025
      demoPhRef.current = Math.max(5, Math.min(10, demoPhRef.current + phStep))
      const phValue = Math.round(demoPhRef.current * 100) / 100

      setHeat(temp)
      setPh(phValue)
      heatRef.current = temp
      phRef.current = phValue
      maybeNotifyOverheat(temp)
      maybeNotifyPhRange(phValue)
      maybeApplyKillSwitch(temp, phValue, true)
      setLogs(prev => [
        { id: genId(), timestamp: new Date(), temperature: temp, ph: phValue },
        ...prev.slice(0, 99),
      ])

      demoCycleCounterRef.current += 1
      if (demoCycleCounterRef.current >= 10) {
        demoCycleCounterRef.current = 0
        setCycles(prev => prev + 1)
      }

    }, 1000)
  }, [stopDemo, maybeNotifyOverheat, maybeNotifyPhRange, maybeApplyKillSwitch])

  // --- Real WebSocket / Connect logic remains same...
  const connect = useCallback(() => {
    if (getSettings().demoMode) return
    if (wsRef.current) wsRef.current.close()
    const wsUrl = getWebSocketUrl()
    setConnectionStatus("connecting")
    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch (e) {
      setConnectionStatus("disconnected")
      const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptRef.current), RECONNECT_MAX_DELAY)
      reconnectAttemptRef.current += 1
      reconnectTimeoutRef.current = setTimeout(connect, delay)
      return
    }
    wsRef.current = ws
    ws.onopen = () => { setConnectionStatus("connected"); reconnectAttemptRef.current = 0 }
    ws.onmessage = (event) => { try { handleMessage(JSON.parse(event.data)) } catch {}}
    ws.onclose = () => { setConnectionStatus("disconnected"); if (getSettings().demoMode) return; const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptRef.current), RECONNECT_MAX_DELAY); reconnectAttemptRef.current += 1; reconnectTimeoutRef.current = setTimeout(connect, delay) }
  }, [handleMessage])

  const reconnect = useCallback(() => { reconnectAttemptRef.current = 0; if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current); stopDemo(); if (getSettings().demoMode) startDemo(); else connect() }, [connect, startDemo, stopDemo])

  useEffect(() => { if (getSettings().demoMode) startDemo(); else connect(); return () => { stopDemo(); if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current); if (wsRef.current) wsRef.current.close() } }, [connect, startDemo, stopDemo])

  // Hydrate log history once from REST (live readings stream arrives over /ws).
  useEffect(() => {
    if (getSettings().demoMode) return
    let cancelled = false
    void api.getHistory(100)
      .then(({ temperature, ph }) => {
        if (cancelled) return
        const byId = new Map<number, { id: string; timestamp: Date; temperature: number; ph: number }>()
        for (const t of temperature) {
          byId.set(t.id, {
            id: t.id.toString(),
            timestamp: new Date(t.timestamp),
            temperature: t.temperature,
            ph: 7,
          })
        }
        for (const p of ph) {
          const existing = byId.get(p.id)
          if (existing) existing.ph = p.ph
          else byId.set(p.id, {
            id: p.id.toString(),
            timestamp: new Date(p.timestamp),
            temperature: 0,
            ph: p.ph,
          })
        }
        const merged = Array.from(byId.values()).sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
        )
        setLogs(merged)
      })
      .catch((err) => console.error("getHistory failed:", err))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (isRunning && config.numCycles > 0 && cycles >= config.numCycles) {
      if (getSettings().demoMode) {
        setIsRunning(false);
        setStatus("Disconnected");
        notifyUser("Batch complete: Tumbler stopped")
      }
      else { void api.stopSystem().catch((err) => console.error("stopSystem failed:", err)) }
      alert("BATCH COMPLETE: Target rotations reached.")
    }
  }, [cycles, isRunning, config.numCycles, notifyUser])

  const shellyDirectOn = useCallback(async (): Promise<boolean> => {
    const settings = getSettings(); if (!settings.shellyIp) return false
    try {
      const resp = await fetch(`http://${settings.shellyIp}/rpc/Switch.Set?id=0&on=true`, { signal: AbortSignal.timeout(5000) })
      if (resp.ok) { setIsRunning(true); setStatus("Forward") }
      return resp.ok
    } catch { return false }
  }, [])

  const shellyDirectOff = useCallback(async (): Promise<boolean> => {
    const settings = getSettings(); if (!settings.shellyIp) return false
    try {
      const resp = await fetch(`http://${settings.shellyIp}/rpc/Switch.Set?id=0&on=false`, { signal: AbortSignal.timeout(5000) })
      if (resp.ok) { setIsRunning(false); setStatus("Disconnected"); setHeat(0) }
      return resp.ok
    } catch { return false }
  }, [])

  const start = useCallback(async () => {
    overheatWarnedRef.current = false
    phLowWarnedRef.current = false
    phHighWarnedRef.current = false
    killSwitchTriggeredRef.current = false
    setHeatWarningActive(false)
    setPhWarningActive(false)
    if (getSettings().demoMode) {
      setIsRunning(true);
      setStatus("Forward");
      notifyUser("Tumbler started");
      return
    }
    try {
      const response = await api.startSystem()
      if (response.success) {
        setIsRunning(true)
        setStatus("Forward")
        setCycles(response.state.cycles)
        notifyUser("Tumbler started")
        return
      }
    } catch (err) {
      console.error("startSystem failed:", err)
    }
    const settings = getSettings()
    if (settings.shellyDirectEnabled && settings.shellyIp) {
      const ok = await shellyDirectOn()
      if (ok) notifyUser("Tumbler started")
    }
  }, [shellyDirectOn, notifyUser])

  const stop = useCallback(async () => {
    overheatWarnedRef.current = false
    phLowWarnedRef.current = false
    phHighWarnedRef.current = false
    killSwitchTriggeredRef.current = false
    setHeatWarningActive(false)
    setPhWarningActive(false)
    if (getSettings().demoMode) {
      setIsRunning(false);
      setStatus("Disconnected");
      setPh(7)
      phRef.current = 7
      heatRef.current = 0
      notifyUser("Tumbler stopped");
      return
    }
    try {
      const response = await api.stopSystem()
      if (response.success) {
        setIsRunning(false)
        setStatus("Disconnected")
        setHeat(0)
        setPh(7)
        phRef.current = 7
        heatRef.current = 0
        setCycles(response.state.cycles)
        notifyUser("Tumbler stopped")
        return
      }
    } catch (err) {
      console.error("stopSystem failed:", err)
    }
    const settings = getSettings()
    if (settings.shellyDirectEnabled && settings.shellyIp) {
      const ok = await shellyDirectOff()
      if (ok) notifyUser("Tumbler stopped")
    }
  }, [shellyDirectOff, notifyUser])

  const resetCycles = useCallback(() => {
    if (getSettings().demoMode) { setCycles(0); demoCycleCounterRef.current = 0; return }
    void api.resetCycles()
      .then((response) => { if (response.success) setCycles(response.state.cycles) })
      .catch((err) => console.error("resetCycles failed:", err))
  }, [])

  const clearLogs = useCallback(() => {
    if (window.confirm("Are you sure?")) {
      if (getSettings().demoMode) { setLogs([]); return }
      void api.clearLogs()
        .then((response) => { if (response.success) setLogs([]) })
        .catch((err) => console.error("clearLogs failed:", err))
    }
  }, [])

  const clearNotificationLogs = useCallback(() => { setNotificationLogs([]) }, [])

  const updateConfig = useCallback((newConfig: Config) => { setConfig(prev => ({ ...prev, ...newConfig })) }, [])

  return (
    <DashboardContext.Provider
      value={{
        status, connectionStatus, heat, ph, cycles, logs, notificationLogs, config, isRunning,
        start, stop, resetCycles, clearLogs, clearNotificationLogs, updateConfig, reconnect,
        shellyDirectOn, shellyDirectOff,
      }}
    >
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider")
  return ctx
}