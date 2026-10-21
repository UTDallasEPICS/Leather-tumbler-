"use client"

// Setup-guide progress, one independent copy per tumbler: its own hide weight, stage and step,
// completed steps and countdown. Timers keep running while you look at another screen or
// another tumbler. Progress (not the running timer) is saved in this browser.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useDashboard } from "@/lib/dashboard-context"
import { sendLocalNotification } from "@/lib/local-notifications"
import { PROCESS_STAGES, stepKey } from "@/lib/setup-recipe"

export interface TumblerSetup {
  hideWeightKg: number
  processIndex: number
  stepIndex: number
  selectedDurations: Record<string, number>
  completedSteps: Record<string, boolean>
  isRunning: boolean
  remainingSeconds: number
  longCyclePhase: "roll" | "wait"
  longCycleCompletedRolls: number
  /** bumps each time a countdown runs out, so the UI can notify once */
  finishedCount: number
  finishedKey: string | null
}

const STORAGE_KEY = "dava-setup-v1"
const DEFAULT_WEIGHT_KG = 200

// ---- pure helpers ----------------------------------------------------------------------------

export const totalSteps = () => PROCESS_STAGES.reduce((n, stage) => n + stage.steps.length, 0)

export function doneSteps(s: TumblerSetup): number {
  return Object.values(s.completedSteps).filter(Boolean).length
}

export function progressPercent(s: TumblerSetup): number {
  return (doneSteps(s) / totalSteps()) * 100
}

export function durationMinutes(s: TumblerSetup, processIndex = s.processIndex, stepIndex = s.stepIndex): number {
  const step = PROCESS_STAGES[processIndex].steps[stepIndex]
  return s.selectedDurations[stepKey(processIndex, stepIndex)] ?? step.defaultDurationMinutes ?? step.durationOptionsMinutes?.[0] ?? 0
}

function withFreshTimer(s: TumblerSetup): TumblerSetup {
  return {
    ...s,
    isRunning: false,
    longCyclePhase: "roll",
    longCycleCompletedRolls: 0,
    remainingSeconds: durationMinutes(s) * 60,
  }
}

function build(weight: number, processIndex = 0, stepIndex = 0): TumblerSetup {
  const completedSteps: Record<string, boolean> = {}
  PROCESS_STAGES.forEach((stage, p) =>
    stage.steps.forEach((_, st) => {
      if (p < processIndex || (p === processIndex && st < stepIndex)) completedSteps[stepKey(p, st)] = true
    }),
  )
  return withFreshTimer({
    hideWeightKg: weight,
    processIndex,
    stepIndex,
    selectedDurations: {},
    completedSteps,
    isRunning: false,
    remainingSeconds: 0,
    longCyclePhase: "roll",
    longCycleCompletedRolls: 0,
    finishedCount: 0,
    finishedKey: null,
  })
}

// Demo placeholders start at different points so their guides visibly differ.
const DEMO_SEEDS: Record<number, { weight: number; process: number; step: number }> = {
  2: { weight: 150, process: 0, step: 0 },
  3: { weight: 180, process: 1, step: 3 },
  4: { weight: 100, process: 0, step: 0 },
  5: { weight: 120, process: 3, step: 1 },
}

function defaultSetup(id: number, demo: boolean): TumblerSetup {
  const seed = demo ? DEMO_SEEDS[id] : undefined
  return seed ? build(seed.weight, seed.process, seed.step) : build(DEFAULT_WEIGHT_KG)
}

function markComplete(s: TumblerSetup, key: string): TumblerSetup {
  return { ...s, completedSteps: { ...s.completedSteps, [key]: true } }
}

/** One second of countdown. When it reaches zero the step completes (or the long cycle moves on). */
export function tick(s: TumblerSetup): TumblerSetup {
  if (!s.isRunning) return s
  const next = { ...s, remainingSeconds: Math.max(s.remainingSeconds - 1, 0) }
  if (next.remainingSeconds > 0) return next

  const key = stepKey(s.processIndex, s.stepIndex)
  const long = PROCESS_STAGES[s.processIndex].steps[s.stepIndex].longCycleConfig
  const finished = { finishedCount: s.finishedCount + 1, finishedKey: key }

  if (long) {
    if (s.longCyclePhase === "roll") {
      const rolls = s.longCycleCompletedRolls + 1
      if (rolls >= long.totalCycles) {
        return { ...markComplete(next, key), ...finished, isRunning: false, longCycleCompletedRolls: rolls }
      }
      return { ...next, ...finished, longCycleCompletedRolls: rolls, longCyclePhase: "wait", remainingSeconds: long.waitMinutes * 60 }
    }
    return { ...next, ...finished, longCyclePhase: "roll", remainingSeconds: long.rollMinutes * 60 }
  }
  return { ...markComplete(next, key), ...finished, isRunning: false }
}

// ---- persistence -----------------------------------------------------------------------------

type Persisted = Pick<TumblerSetup, "hideWeightKg" | "processIndex" | "stepIndex" | "selectedDurations" | "completedSteps">

function hydrate(raw: Partial<Persisted>): TumblerSetup | null {
  if (!raw || typeof raw !== "object") return null
  const p = Number(raw.processIndex)
  if (!Number.isInteger(p) || p < 0 || p >= PROCESS_STAGES.length) return null
  const st = Number(raw.stepIndex)
  if (!Number.isInteger(st) || st < 0 || st >= PROCESS_STAGES[p].steps.length) return null
  const weight = Number(raw.hideWeightKg)
  return withFreshTimer({
    ...build(Number.isFinite(weight) && weight >= 0 ? weight : DEFAULT_WEIGHT_KG, p, st),
    selectedDurations: raw.selectedDurations ?? {},
    completedSteps: raw.completedSteps ?? {},
  })
}

// ---- provider --------------------------------------------------------------------------------

export interface SetupActions {
  setHideWeight: (kg: number) => void
  goTo: (processIndex: number, stepIndex: number) => void
  next: () => void
  prev: () => void
  chooseDuration: (minutes: number) => void
  startTimer: () => void
  pauseTimer: () => void
  resetTimer: () => void
  markDone: () => void
  restart: () => void
}

interface SetupContextValue {
  get: (id: number) => TumblerSetup
  actionsFor: (id: number) => SetupActions
}

const SetupContext = createContext<SetupContextValue | null>(null)

export function SetupProvider({ children }: { children: React.ReactNode }) {
  const { demoMode } = useDashboard()
  const [saved, setSaved] = useState<Record<number, TumblerSetup>>({})
  const [loaded, setLoaded] = useState(false)
  const demoRef = useRef(demoMode)
  demoRef.current = demoMode
  const defaults = useRef(new Map<string, TumblerSetup>())
  const notified = useRef<Record<number, number>>({})

  const get = useCallback(
    (id: number): TumblerSetup => {
      if (saved[id]) return saved[id]
      const k = `${id}-${demoMode}`
      let d = defaults.current.get(k)
      if (!d) {
        d = defaultSetup(id, demoMode)
        defaults.current.set(k, d)
      }
      return d
    },
    [saved, demoMode],
  )

  // load saved progress once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, Partial<Persisted>>
        const next: Record<number, TumblerSetup> = {}
        for (const [k, v] of Object.entries(parsed)) {
          const h = hydrate(v)
          if (h) next[Number(k)] = h
        }
        setSaved(next)
      }
    } catch {
      // unreadable or blocked storage: start fresh
    }
    setLoaded(true)
  }, [])

  // save progress (not the running timer)
  useEffect(() => {
    if (!loaded) return
    try {
      const out: Record<number, Persisted> = {}
      for (const [k, s] of Object.entries(saved)) {
        out[Number(k)] = {
          hideWeightKg: s.hideWeightKg,
          processIndex: s.processIndex,
          stepIndex: s.stepIndex,
          selectedDurations: s.selectedDurations,
          completedSteps: s.completedSteps,
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
    } catch {
      // storage unavailable: progress just won't survive a reload
    }
  }, [saved, loaded])

  // one shared clock for every running countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setSaved((prev) => {
        let changed = false
        const next = { ...prev }
        for (const [k, s] of Object.entries(prev)) {
          if (s.isRunning) {
            next[Number(k)] = tick(s)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // tell the person when a countdown ends, even if they are on another screen
  useEffect(() => {
    for (const [k, s] of Object.entries(saved)) {
      const id = Number(k)
      const seen = notified.current[id] ?? 0
      if (s.finishedCount > seen) {
        notified.current[id] = s.finishedCount
        if (s.finishedKey) {
          const [p, st] = s.finishedKey.replace("p", "").split("-s").map(Number)
          const step = PROCESS_STAGES[p]?.steps[st]
          if (step) void sendLocalNotification("Setup step finished", `Tumbler ${id}: ${step.title} is done.`).catch(() => {})
        }
      }
    }
  }, [saved])

  const update = useCallback((id: number, fn: (s: TumblerSetup) => TumblerSetup) => {
    setSaved((prev) => ({ ...prev, [id]: fn(prev[id] ?? defaultSetup(id, demoRef.current)) }))
  }, [])

  const actionsFor = useCallback(
    (id: number): SetupActions => {
      const moveTo = (s: TumblerSetup, p: number, st: number) => withFreshTimer({ ...s, processIndex: p, stepIndex: st })
      return {
        setHideWeight: (kg) => update(id, (s) => ({ ...s, hideWeightKg: kg })),
        goTo: (p, st) => update(id, (s) => moveTo(s, p, st)),
        next: () =>
          update(id, (s) => {
            const stage = PROCESS_STAGES[s.processIndex]
            if (s.stepIndex < stage.steps.length - 1) return moveTo(s, s.processIndex, s.stepIndex + 1)
            if (s.processIndex < PROCESS_STAGES.length - 1) return moveTo(s, s.processIndex + 1, 0)
            return s
          }),
        prev: () =>
          update(id, (s) => {
            if (s.stepIndex > 0) return moveTo(s, s.processIndex, s.stepIndex - 1)
            if (s.processIndex > 0) return moveTo(s, s.processIndex - 1, PROCESS_STAGES[s.processIndex - 1].steps.length - 1)
            return s
          }),
        chooseDuration: (minutes) =>
          update(id, (s) =>
            withFreshTimer({ ...s, selectedDurations: { ...s.selectedDurations, [stepKey(s.processIndex, s.stepIndex)]: minutes } }),
          ),
        startTimer: () => update(id, (s) => (s.remainingSeconds > 0 ? { ...s, isRunning: true } : s)),
        pauseTimer: () => update(id, (s) => ({ ...s, isRunning: false })),
        resetTimer: () => update(id, (s) => withFreshTimer(s)),
        markDone: () => update(id, (s) => markComplete({ ...s, isRunning: false }, stepKey(s.processIndex, s.stepIndex))),
        restart: () => update(id, (s) => ({ ...build(s.hideWeightKg), finishedCount: s.finishedCount, finishedKey: s.finishedKey })),
      }
    },
    [update],
  )

  const value = useMemo(() => ({ get, actionsFor }), [get, actionsFor])
  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>
}

export function useTumblerSetup(id: number): { setup: TumblerSetup; actions: SetupActions } {
  const ctx = useContext(SetupContext)
  if (!ctx) throw new Error("useTumblerSetup must be used within SetupProvider")
  const setup = ctx.get(id)
  const actions = useMemo(() => ctx.actionsFor(id), [ctx, id])
  return { setup, actions }
}

/** For lists that show every tumbler's progress at once. */
export function useAllSetups() {
  const ctx = useContext(SetupContext)
  if (!ctx) throw new Error("useAllSetups must be used within SetupProvider")
  return ctx.get
}
