"use client"

// One list of tumblers for the Home, Group and Detail screens.
//
// Tumbler 1 is the real machine: it is built from the DashboardProvider (WebSocket, REST, demo
// simulation). Tumblers 2-5 are placeholders that exist only while Demo Mode is on, so the
// multi-tumbler screens can be tried before the backend knows about more than one machine.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useDashboard } from "@/lib/dashboard-context"

export const HISTORY_POINTS = 30

export interface TumblerInfo {
  id: number
  name: string
  /** true for the machine the backend talks to; false for demo placeholders */
  isReal: boolean
  online: boolean
  running: boolean
  /** null when there is no live reading (offline, or not running) */
  temp: number | null
  ph: number | null
  /** null when drum speed is not measured (real machine, until phase 2) */
  rpm: number | null
  cycles: number
  cycleTarget: number
  hist: { temp: number[]; ph: number[]; rpm: number[] }
}

interface DemoTumbler extends TumblerInfo {
  baseTemp: number
  basePh: number
  ticks: number
}

export interface DemoSetup {
  temp: number
  ph: number
}

interface TumblersState {
  tumblers: TumblerInfo[]
  getTumbler: (id: number) => TumblerInfo | undefined
  toggleDemo: (id: number) => void
  bringOnline: (id: number, setup: DemoSetup) => void
}

const TumblersContext = createContext<TumblersState | null>(null)

// ---- helpers shared by the screens -----------------------------------------------------------

export const clampPct = (v: number) => Math.max(0, Math.min(100, v))
export const phPct = (ph: number) => clampPct((ph / 14) * 100)
export const tempPct = (temp: number, limit: number) => (limit > 0 ? clampPct((temp / limit) * 100) : 0)

export function averageOf(list: TumblerInfo[], key: "temp" | "ph"): number | null {
  const values = list.map((t) => t[key]).filter((v): v is number => v !== null)
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

export function tumblerMeta(t: TumblerInfo): string {
  if (!t.online) return t.isReal ? "Offline · can't reach it" : "Offline · needs setup"
  if (t.running) return `Running · ${t.cycles} of ${t.cycleTarget} cycles`
  return "Ready · not running"
}

// ---- demo placeholders -----------------------------------------------------------------------

// Deterministic (no Math.random) so server and client render the same first frame.
const wave = (base: number, amp: number, phase: number) =>
  Array.from({ length: HISTORY_POINTS }, (_, i) => base + Math.sin(i * 0.7 + phase) * amp)

const demoRunning = (id: number, temp: number, ph: number, rpm: number, cycles: number): DemoTumbler => ({
  id,
  name: `Tumbler ${id}`,
  isReal: false,
  online: true,
  running: true,
  temp,
  ph,
  rpm,
  cycles,
  cycleTarget: 10,
  baseTemp: temp,
  basePh: ph,
  ticks: 0,
  hist: { temp: wave(temp, 0.6, id), ph: wave(ph, 0.1, id + 1), rpm: wave(rpm, 0.5, id + 2) },
})

const demoOffline = (id: number): DemoTumbler => ({
  id,
  name: `Tumbler ${id}`,
  isReal: false,
  online: false,
  running: false,
  temp: null,
  ph: null,
  rpm: null,
  cycles: 0,
  cycleTarget: 10,
  baseTemp: 40,
  basePh: 4,
  ticks: 0,
  hist: { temp: [], ph: [], rpm: [] },
})

const initialFleet = (): DemoTumbler[] => [
  demoOffline(2),
  demoRunning(3, 41.0, 3.9, 12, 4),
  demoOffline(4),
  demoRunning(5, 36.4, 4.4, 10, 7),
]

const pushHist = (arr: number[], v: number) => [...arr, v].slice(-HISTORY_POINTS)

function tickDemo(t: DemoTumbler): DemoTumbler {
  if (!t.online) return t
  if (!t.running) return { ...t, rpm: Math.max(0, (t.rpm ?? 0) - 2) }

  const temp = (t.temp ?? t.baseTemp) + (Math.random() - 0.5) * 0.25
  const ph = (t.ph ?? t.basePh) + (Math.random() - 0.5) * 0.03
  const rpm = Math.max(6, Math.min(20, (t.rpm ?? 12) + (Math.random() - 0.5) * 0.6))
  const ticks = t.ticks + 1
  const cycles = ticks % 20 === 0 ? t.cycles + 1 : t.cycles
  const done = cycles >= t.cycleTarget

  return {
    ...t,
    ticks,
    cycles,
    running: !done,
    temp: done ? null : temp,
    ph: done ? null : ph,
    rpm,
    hist: { temp: pushHist(t.hist.temp, temp), ph: pushHist(t.hist.ph, ph), rpm: pushHist(t.hist.rpm, rpm) },
  }
}

// ---- provider --------------------------------------------------------------------------------

export function TumblersProvider({ children }: { children: React.ReactNode }) {
  const { connectionStatus, isRunning, heat, ph, cycles, logs, config, demoMode } = useDashboard()
  const [fleet, setFleet] = useState<DemoTumbler[]>(initialFleet)

  useEffect(() => {
    if (!demoMode) return
    const timer = setInterval(() => setFleet((f) => f.map(tickDemo)), 1500)
    return () => clearInterval(timer)
  }, [demoMode])

  const toggleDemo = useCallback((id: number) => {
    setFleet((f) =>
      f.map((t) => {
        if (t.id !== id || !t.online) return t
        if (t.running) return { ...t, running: false, temp: null, ph: null }
        const restart = t.cycles >= t.cycleTarget
        return { ...t, running: true, temp: t.baseTemp, ph: t.basePh, rpm: 12, cycles: restart ? 0 : t.cycles, ticks: 0 }
      }),
    )
  }, [])

  const bringOnline = useCallback((id: number, setup: DemoSetup) => {
    setFleet((f) =>
      f.map((t) =>
        t.id === id
          ? {
              ...demoRunning(id, setup.temp, setup.ph, 12, 0),
              hist: { temp: wave(setup.temp, 0.4, id), ph: wave(setup.ph, 0.08, id + 1), rpm: wave(12, 0.4, id + 2) },
            }
          : t,
      ),
    )
  }, [])

  const real = useMemo<TumblerInfo>(() => {
    const online = connectionStatus === "connected"
    const running = online && isRunning
    // logs are newest-first; the history merge can leave temperature 0 for pH-only rows
    const points = logs
      .slice(0, HISTORY_POINTS)
      .filter((l) => l.temperature > 0)
      .reverse()
    return {
      id: 1,
      name: "Tumbler 1",
      isReal: true,
      online,
      running,
      temp: running ? heat : null,
      ph: running ? ph : null,
      rpm: demoMode ? (running ? 15 : 0) : null,
      cycles,
      cycleTarget: config.numCycles,
      hist: { temp: points.map((l) => l.temperature), ph: points.map((l) => l.ph), rpm: [] },
    }
  }, [connectionStatus, isRunning, heat, ph, cycles, logs, config.numCycles, demoMode])

  const tumblers = useMemo<TumblerInfo[]>(() => (demoMode ? [real, ...fleet] : [real]), [demoMode, real, fleet])

  const getTumbler = useCallback((id: number) => tumblers.find((t) => t.id === id), [tumblers])

  const value = useMemo(() => ({ tumblers, getTumbler, toggleDemo, bringOnline }), [tumblers, getTumbler, toggleDemo, bringOnline])

  return <TumblersContext.Provider value={value}>{children}</TumblersContext.Provider>
}

export function useTumblers() {
  const ctx = useContext(TumblersContext)
  if (!ctx) throw new Error("useTumblers must be used within TumblersProvider")
  return ctx
}
