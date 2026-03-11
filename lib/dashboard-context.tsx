"use client"

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react"

export interface LogEntry {
  id: string
  timestamp: Date
  temperature: number
}

export interface Config {
  heatLimit: number
  maxRPM: number
  numCycles: number
}

export type Status = "Forward" | "Rest" | "Disconnected"

interface DashboardState {
  status: Status
  progress: number
  heat: number
  ph: number
  rpm: number
  cycles: number
  logs: LogEntry[]
  config: Config
  isRunning: boolean
  start: () => void
  stop: () => void
  resetCycles: () => void
  clearLogs: () => void
  updateConfig: (config: Config) => void
}

const DashboardContext = createContext<DashboardState | null>(null)

const PHASE_DURATION_MS = 30 * 60 * 1000 // 30 minutes
const TICK_INTERVAL = 1000 // 1 second

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("Disconnected")
  const [progress, setProgress] = useState(0)
  const [heat, setHeat] = useState(0.0)
  const [ph, setPh] = useState(0.0)
  const [rpm, setRpm] = useState(0)
  const [cycles, setCycles] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [config, setConfig] = useState<Config>({
    heatLimit: 80,
    maxRPM: 3000,
    numCycles: 10,
  })
  const [isRunning, setIsRunning] = useState(false)

  // All mutable refs so the interval callback never goes stale
  const startTimeRef = useRef<number>(0)
  const phaseRef = useRef<"Forward" | "Rest">("Forward")
  const cyclesRef = useRef(0)
  const configRef = useRef(config)
  const rpmRef = useRef(rpm)
  const tickCountRef = useRef(0)

  useEffect(() => { configRef.current = config }, [config])
  useEffect(() => { rpmRef.current = rpm }, [rpm])

  // Sync with FastAPI backend
 useEffect(() => {

    const syncWithBackend = async () => {
      try {
        
        const stateResponse = await fetch("http://10.203.142.134:8000/api/system/state")
        const stateData = await stateResponse.json()
        const backendIsActive = stateData.active

        if (backendIsActive !== isRunning) {
          setIsRunning(backendIsActive)
          setStatus(backendIsActive ? "Forward" : "Disconnected")
          
          if (backendIsActive) {
            startTimeRef.current = Date.now()
            setRpm(800) 
            rpmRef.current = 800
          } else {
            setRpm(0)
            rpmRef.current = 0
          }
        }

        if (backendIsActive) {
          const response = await fetch("http://10.203.142.134:8000/api/readings")
          const data = await response.json()
          const readings = data.readings || []

          const latestHeat = readings.filter((r: any) => r.type === "heat").pop()
          const latestPh = readings.filter((r: any) => r.type === "ph").pop()

          if (latestHeat) {
            setHeat(latestHeat.value)
            setLogs(prev => [
              { id: crypto.randomUUID(), timestamp: new Date(), temperature: latestHeat.value },
              ...prev.slice(0, 49) 
            ])
          }
          if (latestPh) setPh(latestPh.value)
        }
        
      } catch (err) {
        console.error("FastAPI Sync Error: Is the backend running on port 8000?")
      }
    }

    const id = setInterval(syncWithBackend, 2000) 
    return () => clearInterval(id)
  }, [isRunning])

  const start = useCallback(async () => {
    try {

      await fetch("http://10.203.142.134:8000/api/system/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      })

      setIsRunning(true); 
      setStatus("Forward");
      startTimeRef.current = Date.now();
      setRpm(800);
      rpmRef.current = 800;
    } catch (err) {
      console.error("Failed to start system on backend:", err);
    }
  }, [])

  const stop = useCallback(async () => {
    try {
      
      await fetch("http://10.203.142.134:8000/api/system/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      })

      setIsRunning(false)
      setStatus("Disconnected")
      setProgress(0)
      setRpm(0)
      rpmRef.current = 0
      tickCountRef.current = 0

      setHeat(0)
      setPh(0)
      setRpm(0)
      rpmRef.current = 0

    } catch (err) {
      console.error("Failed to stop system on backend:", err)
    }
  }, [])

  const resetCycles = useCallback(() => {
    setCycles(0)
    cyclesRef.current = 0
  }, [])

  const clearLogs = useCallback(async () => {
    
    if (window.confirm("Are you sure you want to wipe the entire database history?")) {
      try {
        
        await fetch("http://10.203.142.134:8000/api/readings/clear", {
          method: "DELETE",
        })
        
        setLogs([])
      } catch (err) {
        console.error("Failed to clear backend database:", err)
      }
    }
  }, [])

  const updateConfig = useCallback((newConfig: Config) => {
  setConfig((prev) => ({ ...prev, ...newConfig }))
  }, [])

  // Single useEffect drives the simulation — always cleaned up properly on unmount/re-render
  useEffect(() => {
    if (!isRunning) return

    const id = setInterval(() => {

      // Maximum Cycles: Stops automatically when the batch is finished
      if (cyclesRef.current >= configRef.current.numCycles) {
        stop()
        alert("BATCH COMPLETE: Target rotations reached.")
        return
      }

      // Maximum Heat: Emergency stop if temperature exceeds user config
      if (heat > 0 && heat >= configRef.current.heatLimit) {
        stop()
        alert(`EMERGENCY STOP: Temperature (${heat}°C) exceeded limit!`)
        return
      }

      // Maximum RPM: Mechanical safety cut-off
      if (rpmRef.current > 0 && rpmRef.current > configRef.current.maxRPM) {
        stop()
        alert(`EMERGENCY STOP: RPM (${rpmRef.current}) is too high!`)
        return
      }
      
      // --- 2. PROGRESS & PHASE LOGIC ---
      const elapsed = Date.now() - startTimeRef.current
      const pct = Math.min((elapsed / PHASE_DURATION_MS) * 100, 100)

      // Phase transition (Forward -> Rest)
      if (pct >= 100) {
        phaseRef.current = phaseRef.current === "Forward" ? "Rest" : "Forward"
        setStatus(phaseRef.current)
        startTimeRef.current = Date.now()
        setProgress(0)
        tickCountRef.current = 0
        return
      }

      setProgress(pct)

      // --- 3. FORWARD PHASE SIMULATION ---
      if (phaseRef.current === "Forward") {
        tickCountRef.current += 1
        
        // Increment cycle count every 60 seconds (simulated rotation)
        if (tickCountRef.current % 60 === 0) {
          cyclesRef.current += 1
          setCycles(cyclesRef.current)
        }

        // Simulate RPM drift (slightly overshoot for safety testability)
        const prevRPM = rpmRef.current
        const nextRPM = Math.min(
          Math.max(Math.round(prevRPM + (Math.random() * 100 - 30)), 500), 
          configRef.current.maxRPM + 50 
        )
        setRpm(nextRPM)
        rpmRef.current = nextRPM
      }
    }, TICK_INTERVAL)

    return () => clearInterval(id)
    
  }, [isRunning, heat, stop])

  return (
    <DashboardContext.Provider
      value={{
        status,
        progress,
        heat,
        ph,
        rpm,
        cycles,
        logs,
        config,
        isRunning,
        start,
        stop,
        resetCycles,
        clearLogs,
        updateConfig,
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
