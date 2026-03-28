//definition file for the main dashboard managing websock conneciton and global state stuff.

"use client"

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react"
import { getSettings, getWebSocketUrl } from "@/lib/settings"

export interface LogEntry {
  id: string
  timestamp: Date
  temperature: number
}

export interface Config {
  heatLimit: number
  numCycles: number
}

export type ConnectionStatus = "connected" | "connecting" | "disconnected"
export type Status = "Forward" | "Rest" | "Disconnected"

interface DashboardState {
  status: Status
  connectionStatus: ConnectionStatus
  heat: number
  cycles: number
  logs: LogEntry[]
  config: Config
  isRunning: boolean
  start: () => Promise<void> | void
  stop: () => Promise<void> | void
  resetCycles: () => void
  clearLogs: () => void
  updateConfig: (config: Config) => void
  reconnect: () => void
  shellyDirectOn: () => Promise<boolean>
  shellyDirectOff: () => Promise<boolean>
}

const DashboardContext = createContext<DashboardState | null>(null)

const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [status, setStatus] = useState<Status>("Disconnected")
  const [heat, setHeat] = useState(0.0)
  const [cycles, setCycles] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [config, setConfig] = useState<Config>({ heatLimit: 80, numCycles: 10 })
  const [isRunning, setIsRunning] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRef = useRef(config)

  // Demo mode refs
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const demoTempRef = useRef(25.0)
  const isRunningRef = useRef(false)
  const demoCycleCounterRef = useRef(0)

  useEffect(() => { configRef.current = config }, [config])
  useEffect(() => { isRunningRef.current = isRunning }, [isRunning])

  const sendMessage = useCallback((data: object) => {
    if (wsRef.current?.readyState === 1) { // 1 = WebSocket.OPEN
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case "temperature":
        setHeat(data.value)
        setLogs(prev => [
          { id: data.id?.toString() || crypto.randomUUID(), timestamp: new Date(data.timestamp), temperature: data.value },
          ...prev.slice(0, 99),
        ])
        // Client-side heat limit safety check
        if (data.value >= configRef.current.heatLimit) {
          sendMessage({ type: "stop" })
          alert(`EMERGENCY STOP: Temperature (${data.value}°C) exceeded limit!`)
        }
        break

      case "history":
        setLogs(
          (data.readings || []).map((r: any) => ({
            id: r.id?.toString() || crypto.randomUUID(),
            timestamp: new Date(r.timestamp),
            temperature: r.temperature,
          }))
        )
        break

      case "system_state":
        setIsRunning(data.active)
        setCycles(data.cycles ?? 0)
        setStatus(data.active ? "Forward" : "Disconnected")
        break

      case "relay_ack":
        if (data.action === "start" && data.success) {
          setIsRunning(true)
          setStatus("Forward")
        } else if (data.action === "stop" && data.success) {
          setIsRunning(false)
          setStatus("Disconnected")
          setHeat(0)
        } else if (data.action === "reset_cycles" && data.success) {
          setCycles(0)
        } else if (data.action === "clear_logs" && data.success) {
          setLogs([])
        }
        break
    }
  }, [sendMessage])

  // --- Demo mode ---

  const stopDemo = useCallback(() => {
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current)
      demoIntervalRef.current = null
    }
  }, [])

  const startDemo = useCallback(() => {
    // Tear down any real connection
    if (wsRef.current) wsRef.current.close()
    wsRef.current = null
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    reconnectTimeoutRef.current = null
    stopDemo()

    setConnectionStatus("connected")
    setStatus("Disconnected")
    setIsRunning(false)
    demoTempRef.current = 25.0
    demoCycleCounterRef.current = 0

    demoIntervalRef.current = setInterval(() => {
      if (!isRunningRef.current) return // only generate data when "running"

      // Drifting temperature with slight upward bias
      const drift = (Math.random() - 0.35) * 1.2
      demoTempRef.current = Math.max(15, Math.min(70, demoTempRef.current + drift))
      const temp = Math.round(demoTempRef.current * 100) / 100

      setHeat(temp)
      setLogs(prev => [
        { id: crypto.randomUUID(), timestamp: new Date(), temperature: temp },
        ...prev.slice(0, 99),
      ])

      // Increment cycles every ~10 readings
      demoCycleCounterRef.current += 1
      if (demoCycleCounterRef.current >= 10) {
        demoCycleCounterRef.current = 0
        setCycles(prev => prev + 1)
      }

      // Client-side heat limit safety check (works in demo too)
      if (temp >= configRef.current.heatLimit) {
        setIsRunning(false)
        setStatus("Disconnected")
        alert(`EMERGENCY STOP: Temperature (${temp}°C) exceeded limit!`)
      }
    }, 1000)
  }, [stopDemo])

  // --- Real WebSocket connection ---

  const connect = useCallback(() => {
    // Don't connect if demo mode is active
    if (getSettings().demoMode) return

    if (wsRef.current) {
      wsRef.current.close()
    }

    const wsUrl = getWebSocketUrl()
    setConnectionStatus("connecting")
    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch (e) {
      console.error("WebSocket creation failed:", e)
      setConnectionStatus("disconnected")
      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptRef.current),
        RECONNECT_MAX_DELAY,
      )
      reconnectAttemptRef.current += 1
      reconnectTimeoutRef.current = setTimeout(connect, delay)
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      setConnectionStatus("connected")
      reconnectAttemptRef.current = 0
      ws.send(JSON.stringify({ type: "get_history", limit: 100 }))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleMessage(data)
      } catch {
        console.error("Failed to parse WebSocket message")
      }
    }

    ws.onclose = () => {
      setConnectionStatus("disconnected")
      // Don't reconnect if demo mode was enabled while connected
      if (getSettings().demoMode) return
      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptRef.current),
        RECONNECT_MAX_DELAY,
      )
      reconnectAttemptRef.current += 1
      reconnectTimeoutRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      // onclose fires after onerror — reconnect handled there
    }
  }, [handleMessage])

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    stopDemo()

    if (getSettings().demoMode) {
      startDemo()
    } else {
      connect()
    }
  }, [connect, startDemo, stopDemo])

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    if (getSettings().demoMode) {
      startDemo()
    } else {
      connect()
    }
    return () => {
      stopDemo()
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect, startDemo, stopDemo])

  // Client-side cycle limit check
  useEffect(() => {
    if (isRunning && config.numCycles > 0 && cycles >= config.numCycles) {
      if (getSettings().demoMode) {
        setIsRunning(false)
        setStatus("Disconnected")
      } else {
        sendMessage({ type: "stop" })
      }
      alert("BATCH COMPLETE: Target rotations reached.")
    }
  }, [cycles, isRunning, config.numCycles, sendMessage])

  // --- Shelly direct control (fallback) ---

  const shellyDirectOn = useCallback(async (): Promise<boolean> => {
    const settings = getSettings()
    if (!settings.shellyIp) return false
    try {
      const resp = await fetch(
        `http://${settings.shellyIp}/rpc/Switch.Set?id=0&on=true`,
        { signal: AbortSignal.timeout(5000) },
      )
      if (resp.ok) {
        setIsRunning(true)
        setStatus("Forward")
      }
      return resp.ok
    } catch {
      return false
    }
  }, [])

  const shellyDirectOff = useCallback(async (): Promise<boolean> => {
    const settings = getSettings()
    if (!settings.shellyIp) return false
    try {
      const resp = await fetch(
        `http://${settings.shellyIp}/rpc/Switch.Set?id=0&on=false`,
        { signal: AbortSignal.timeout(5000) },
      )
      if (resp.ok) {
        setIsRunning(false)
        setStatus("Disconnected")
        setHeat(0)
      }
      return resp.ok
    } catch {
      return false
    }
  }, [])

  // --- Start/stop with demo + Shelly fallback ---

  const start = useCallback(async () => {
    if (getSettings().demoMode) {
      setIsRunning(true)
      setStatus("Forward")
      return
    }
    if (wsRef.current?.readyState === 1) {
      sendMessage({ type: "start" })
    } else {
      const settings = getSettings()
      if (settings.shellyDirectEnabled && settings.shellyIp) {
        const ok = await shellyDirectOn()
        if (!ok) {
          console.warn("Shelly direct control failed — device unreachable")
        }
      }
    }
  }, [sendMessage, shellyDirectOn])

  const stop = useCallback(async () => {
    if (getSettings().demoMode) {
      setIsRunning(false)
      setStatus("Disconnected")
      return
    }
    if (wsRef.current?.readyState === 1) {
      sendMessage({ type: "stop" })
    } else {
      const settings = getSettings()
      if (settings.shellyDirectEnabled && settings.shellyIp) {
        const ok = await shellyDirectOff()
        if (!ok) {
          console.warn("Shelly direct control failed — device unreachable")
        }
      }
    }
  }, [sendMessage, shellyDirectOff])

  const resetCycles = useCallback(() => {
    if (getSettings().demoMode) {
      setCycles(0)
      demoCycleCounterRef.current = 0
      return
    }
    sendMessage({ type: "reset_cycles" })
  }, [sendMessage])

  const clearLogs = useCallback(() => {
    if (window.confirm("Are you sure you want to wipe the entire database history?")) {
      if (getSettings().demoMode) {
        setLogs([])
        return
      }
      sendMessage({ type: "clear_logs" })
    }
  }, [sendMessage])

  const updateConfig = useCallback((newConfig: Config) => {
    setConfig(prev => ({ ...prev, ...newConfig }))
  }, [])

  return (
    <DashboardContext.Provider
      value={{
        status,
        connectionStatus,
        heat,
        cycles,
        logs,
        config,
        isRunning,
        start,
        stop,
        resetCycles,
        clearLogs,
        updateConfig,
        reconnect,
        shellyDirectOn,
        shellyDirectOff,
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
