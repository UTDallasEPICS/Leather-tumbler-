"use client"

// Runs: one batch of hides taken through the whole recipe in one tumbler. A tumbler has at most one
// active run; the next can start once it is completed (leather out) or overridden. Timers count wall-clock
// time, so they keep going through reloads.
//
// Real runs are kept on the tumbler's controller and shared by every device (lib/run-sync.ts); a change
// is recorded as a RunOp so it can be made again on top of another device's newer copy. Demo runs, and
// real runs from before this device reached a controller that keeps them, stay in this browser.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useDashboard } from "@/lib/dashboard-context"
import { sendLocalNotification } from "@/lib/local-notifications"
import { RECIPE, TOTAL_STEPS, stepKey, stepMinutes, type Action, type RecipeStep, type Stage, type StageId } from "@/lib/recipe"
import { seededActiveRun, seededHistory } from "@/lib/run-demo"
import { RunSync, clockNow, type Notice, type Pending } from "@/lib/run-sync"
import { getSettings } from "@/lib/settings"
import { useTumblers, type TumblerInfo } from "@/lib/tumblers"

export interface Timer {
  /** when it was last started; null while paused */
  startedAt: number | null
  elapsedMs: number
}
export interface Agg {
  n: number
  sum: number
  sumSq: number
  min: number
  max: number
}
export type Quality = "good" | "issues" | "poor"
export type RunStatus = "active" | "completed" | "overridden"
export type SensorKey = "temp" | "ph" | "rpm"

export interface StepState {
  added: boolean[]
  tasks: boolean[]
  /** chosen run length, for steps that offer a choice */
  minutes?: number
  timer?: Timer
  /** more running after a check came in short */
  extra?: { minutes: number; timer: Timer }
  extraTotalMin: number
  measured: number[]
  confirmed?: boolean
  /** moved on although the check missed its target */
  accepted?: boolean
  /** ran more after a miss; waiting for a fresh reading or answer */
  recheck?: boolean
  early?: boolean
  doneAt?: number
}

export interface Run {
  id: string
  number: number
  tumblerId: number
  /** started while Demo Mode was on; kept apart from real history */
  demo: boolean
  recipeId: string
  hideWeightKg: number
  startedAt: number
  endedAt?: number
  status: RunStatus
  overrideReason?: string
  /** stage and step indexes. step == steps.length: the stage's end checks. stage == stages.length: taking the leather out */
  stage: number
  step: number
  steps: Record<string, StepState>
  stageStartedAt: Partial<Record<StageId, number>>
  stageEndedAt: Partial<Record<StageId, number>>
  passed: Partial<Record<StageId, boolean[]>>
  sensors: Partial<Record<StageId, Partial<Record<SensorKey, Agg>>>>
  outcome?: { quality: Quality; note: string }
  /** set by the controller (see lib/runs-api.ts); absent on runs kept only on this device */
  rev?: number
  seq?: number
  updatedAt?: number
  stageId?: StageId | null
}

/** A reminder; each key is sent once per device. dueAt: when it became due. */
type Reminder = { key: string; title: string; body: string; dueAt: number }

// ---- pure helpers ----------------------------------------------------------------------------

export const EMPTY_STEP: StepState = { added: [], tasks: [], extraTotalMin: 0, measured: [] }
export const stepStateOf = (run: Run, key: string): StepState => run.steps[key] ?? EMPTY_STEP

export const elapsedMs = (t: Timer | undefined, now: number) => (t ? t.elapsedMs + (t.startedAt !== null ? now - t.startedAt : 0) : 0)
const ticking = (t?: Timer) => !!t && t.startedAt !== null
const pause = (t: Timer, now: number): Timer => (t.startedAt === null ? t : { startedAt: null, elapsedMs: t.elapsedMs + now - t.startedAt })

export const meanOf = (a?: Agg) => (a && a.n ? a.sum / a.n : null)
function addTo(a: Agg | undefined, v: number): Agg {
  if (!a) return { n: 1, sum: v, sumSq: v * v, min: v, max: v }
  return { n: a.n + 1, sum: a.sum + v, sumSq: a.sumSq + v * v, min: Math.min(a.min, v), max: Math.max(a.max, v) }
}

export type RunPhase =
  | { kind: "step"; stage: Stage; step: RecipeStep; key: string }
  | { kind: "stage-check"; stage: Stage }
  | { kind: "finish" }

export function phaseOf(run: Run): RunPhase {
  const stage = RECIPE.stages[run.stage]
  if (!stage) return { kind: "finish" }
  const step = stage.steps[run.step]
  if (!step) return { kind: "stage-check", stage }
  return { kind: "step", stage, step, key: stepKey(stage, step) }
}

export function doneSteps(run: Run): number {
  return RECIPE.stages.reduce((n, s, i) => n + (i < run.stage ? s.steps.length : i === run.stage ? Math.min(run.step, s.steps.length) : 0), 0)
}
export const runProgress = (run: Run) => doneSteps(run) / TOTAL_STEPS

export interface Clock {
  durationMs: number
  elapsed: number
  remaining: number
  finished: boolean
  ticking: boolean
}

function clockOf(durationMs: number, t: Timer | undefined, now: number): Clock {
  const elapsed = Math.min(elapsedMs(t, now), durationMs)
  return { durationMs, elapsed, remaining: durationMs - elapsed, finished: elapsed >= durationMs, ticking: ticking(t) && elapsed < durationMs }
}

/** The step's own countdown (run, rest or intermittent); null for steps without one. */
export function mainClock(step: RecipeStep, s: StepState, now: number): Clock | null {
  const k = step.action?.kind
  if (k !== "run" && k !== "rest" && k !== "intermittent") return null
  return clockOf(stepMinutes(step, s.minutes) * 60_000, s.timer, now)
}

export const extraClock = (s: StepState, now: number): Clock | null => (s.extra ? clockOf(s.extra.minutes * 60_000, s.extra.timer, now) : null)

export interface Cycle {
  index: number
  count: number
  phase: "run" | "rest"
  phaseRemaining: number
}

/** Where an intermittent step is: which block, and whether the drum should be running in it. */
export function cycleAt(a: Extract<Action, { kind: "intermittent" }>, elapsed: number): Cycle {
  const every = a.everyMinutes * 60_000
  const run = a.runMinutes * 60_000
  const count = Math.round((a.hours * 60) / a.everyMinutes)
  const index = Math.min(Math.floor(elapsed / every), count - 1)
  const offset = elapsed - index * every
  const phase = offset < run ? "run" : "rest"
  return { index, count, phase, phaseRemaining: Math.max(0, phase === "run" ? run - offset : every - offset) }
}

export const inTarget = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi

/** ready: the step can be marked done. onlyTimeLeft: everything is ticked off but a countdown is still going. */
export function readiness(step: RecipeStep, s: StepState, now: number): { ready: boolean; onlyTimeLeft: boolean } {
  const adds = (step.adds ?? []).every((_, i) => s.added[i])
  const tasks = (step.tasks ?? []).every((_, i) => s.tasks[i])
  const main = mainClock(step, s, now)
  const extra = extraClock(s, now)
  const a = step.action
  let check = true
  if (a?.kind === "measure") {
    const last = s.measured.at(-1)
    check = last !== undefined && (inTarget(last, a.target) || !!s.accepted)
  }
  if (a?.kind === "confirm") check = s.confirmed === true || (s.confirmed === false && !!s.accepted)
  const time = (!main || main.finished) && (!extra || extra.finished || !!s.accepted)
  const rest = adds && tasks && check
  return { ready: rest && time, onlyTimeLeft: rest && !time }
}

export function patchStep(run: Run, key: string, fn: (s: StepState) => StepState): Run {
  return { ...run, steps: { ...run.steps, [key]: fn(stepStateOf(run, key)) } }
}

function enterStage(run: Run, index: number, now: number): Run {
  const stage = RECIPE.stages[index]
  if (!stage) return { ...run, stage: RECIPE.stages.length, step: 0 }
  return { ...run, stage: index, step: 0, stageStartedAt: { ...run.stageStartedAt, [stage.id]: run.stageStartedAt[stage.id] ?? now } }
}

function leaveStage(run: Run, now: number, passed?: boolean[]): Run {
  const stage = RECIPE.stages[run.stage]
  const out: Run = {
    ...run,
    stageEndedAt: { ...run.stageEndedAt, [stage.id]: now },
    passed: passed ? { ...run.passed, [stage.id]: passed } : run.passed,
  }
  return enterStage(out, run.stage + 1, now)
}

/** Marks the current step done (early: before its countdown ran out) and moves on. */
export function advance(run: Run, now: number, early = false): Run {
  const ph = phaseOf(run)
  if (ph.kind !== "step") return run
  const next = patchStep(run, ph.key, (s) => ({
    ...s,
    early: s.early || early,
    doneAt: now,
    timer: s.timer && pause(s.timer, now),
    extra: s.extra && { ...s.extra, timer: pause(s.extra.timer, now) },
  }))
  if (run.step + 1 < ph.stage.steps.length) return { ...next, step: run.step + 1 }
  if (ph.stage.passChecks.length) return { ...next, step: ph.stage.steps.length }
  return leaveStage(next, now)
}

export const passStage = (run: Run, passed: boolean[], now: number) => leaveStage(run, now, passed)

/** When a timer reaches `elapsed`, in wall-clock time. */
const wallAt = (t: Timer, elapsed: number) => (t.startedAt ?? 0) + elapsed - t.elapsedMs

/** The reminder a run calls for at `now`, worked out from its timers, so nothing has to be written back. */
function reminderOf(run: Run, now: number): Reminder | undefined {
  const ph = phaseOf(run)
  if (run.status !== "active" || ph.kind !== "step") return
  const s = stepStateOf(run, ph.key)
  const who = `Tumbler ${run.tumblerId}`

  const extra = extraClock(s, now)
  if (s.extra && extra?.finished && ticking(s.extra.timer))
    return {
      key: `${ph.key}:extra${s.extraTotalMin}`,
      title: "Extra running done",
      body: `${who}: check ${ph.step.title.toLowerCase()} again.`,
      dueAt: wallAt(s.extra.timer, extra.durationMs),
    }

  const main = mainClock(ph.step, s, now)
  if (!main || !s.timer || !ticking(s.timer)) return
  if (main.finished) return { key: `${ph.key}:done`, title: "Step finished", body: `${who}: ${ph.step.title} is done.`, dueAt: wallAt(s.timer, main.durationMs) }
  const a = ph.step.action
  if (a?.kind !== "intermittent") return
  const c = cycleAt(a, main.elapsed)
  if (c.index === 0 && c.phase === "run") return
  const dueAt = wallAt(s.timer, (c.index * a.everyMinutes + (c.phase === "rest" ? a.runMinutes : 0)) * 60_000)
  const key = `${ph.key}:c${c.index}:${c.phase}`
  return c.phase === "run"
    ? { key, title: "Run the drum now", body: `${who}: run ${c.index + 1} of ${c.count}, ${a.runMinutes} minutes.`, dueAt }
    : { key, title: "Stop the drum", body: `${who}: rest until the next run.`, dueAt }
}

/** Adds the drum's readings to the run's current stage. Only for runs kept on this device: the controller
 * does this itself for the runs it keeps, whether or not an app is open. */
function sample(run: Run, t: TumblerInfo): Run {
  const ph = phaseOf(run)
  if (!t.running || ph.kind === "finish") return run
  const id = ph.stage.id
  const cur = run.sensors[id] ?? {}
  return {
    ...run,
    sensors: {
      ...run.sensors,
      [id]: {
        temp: t.temp === null ? cur.temp : addTo(cur.temp, t.temp),
        ph: t.ph === null ? cur.ph : addTo(cur.ph, t.ph),
        rpm: t.rpm === null ? cur.rpm : addTo(cur.rpm, t.rpm),
      },
    },
  }
}

// ---- changes -----------------------------------------------------------------------------------

/** One thing a person did to a run. Each says what it means ("product 2 is in", "move on from step 3")
 * rather than flipping state, so making it again on another device's newer copy doesn't undo theirs. */
export type RunOp =
  | { type: "create"; run: Run }
  | { type: "added"; key: string; i: number; value: boolean }
  | { type: "task"; key: string; i: number; value: boolean }
  | { type: "minutes"; key: string; minutes: number }
  | { type: "timer"; key: string; action: "start" | "pause" | "reset" }
  | { type: "extra"; key: string; action: "start" | "pause" | "resume"; minutes?: number }
  | { type: "measure"; key: string; value: number }
  | { type: "answer"; key: string; yes: boolean }
  | { type: "accept"; key: string }
  | { type: "next"; stage: number; step: number; early: boolean }
  | { type: "pass"; stage: number; passed: boolean[] }
  | { type: "complete"; quality: Quality; note: string }
  | { type: "override"; reason: string }

const setAt = (list: boolean[], i: number, value: boolean) => {
  const next = [...list]
  next[i] = value
  return next
}

/** The run with the change made at `at`. A change that no longer fits (that step was already moved on
 * from, the run already finished) leaves the run as it is. */
export function applyOp(run: Run | undefined, op: RunOp, at: number): Run | undefined {
  if (op.type === "create") return run ?? op.run
  if (!run || run.status !== "active") return run
  const step = (key: string, fn: (s: StepState) => StepState) => patchStep(run, key, fn)
  switch (op.type) {
    case "added":
      return step(op.key, (s) => ({ ...s, added: setAt(s.added, op.i, op.value) }))
    case "task":
      return step(op.key, (s) => ({ ...s, tasks: setAt(s.tasks, op.i, op.value) }))
    case "minutes":
      return step(op.key, (s) => ({ ...s, minutes: op.minutes, timer: undefined }))
    case "timer":
      return step(op.key, (s) => {
        if (op.action === "reset") return { ...s, timer: undefined }
        if (op.action === "pause") return s.timer ? { ...s, timer: pause(s.timer, at) } : s
        return ticking(s.timer) ? s : { ...s, timer: { startedAt: at, elapsedMs: s.timer?.elapsedMs ?? 0 } }
      })
    case "extra":
      return step(op.key, (s) => {
        if (op.action === "start") {
          // someone already started more running that hasn't finished
          if (s.extra && !extraClock(s, at)?.finished) return s
          const minutes = op.minutes ?? 0
          return { ...s, accepted: false, recheck: true, extraTotalMin: s.extraTotalMin + minutes, extra: { minutes, timer: { startedAt: at, elapsedMs: 0 } } }
        }
        if (!s.extra) return s
        if (op.action === "pause") return { ...s, extra: { ...s.extra, timer: pause(s.extra.timer, at) } }
        return ticking(s.extra.timer) ? s : { ...s, extra: { ...s.extra, timer: { startedAt: at, elapsedMs: s.extra.timer.elapsedMs } } }
      })
    case "measure":
      return step(op.key, (s) => ({ ...s, measured: [...s.measured, op.value], accepted: false, recheck: false }))
    case "answer":
      return step(op.key, (s) => ({ ...s, confirmed: op.yes, accepted: false, recheck: false }))
    case "accept":
      return step(op.key, (s) => ({ ...s, accepted: true }))
    case "next":
      return run.stage === op.stage && run.step === op.step ? advance(run, at, op.early) : run
    case "pass":
      return run.stage === op.stage && phaseOf(run).kind === "stage-check" ? passStage(run, op.passed, at) : run
    case "complete":
      return phaseOf(run).kind === "finish" ? { ...run, status: "completed", endedAt: at, outcome: { quality: op.quality, note: op.note } } : run
    case "override":
      return { ...run, status: "overridden", endedAt: at, overrideReason: op.reason }
  }
}

const applyChanges = (run: Run | undefined, changes: Pending[]) => changes.reduce((r, p) => applyOp(r, p.op, p.at), run)

// ---- formatting --------------------------------------------------------------------------------

export function clock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, "0")
  const ss = String(s).padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** 95 -> "1 h 35 min", 30 -> "30 min". */
export function fmtMinutes(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

export const fmtWhen = (t: number) =>
  new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })

/** The controller's time, re-rendering every `ms` so countdowns move. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => clockNow())
  useEffect(() => {
    const id = setInterval(() => setNow(clockNow()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

// ---- provider --------------------------------------------------------------------------------

const STORAGE_KEY = "dava-runs-v1"
const OLD_SETUP_KEY = "dava-setup-v1"
const SAMPLE_EVERY_MS = 10_000
/** a reminder that fell due longer ago than this (the app was closed) isn't sent late */
const REMIND_WITHIN_MS = 10 * 60_000
const REMOTE_FLASH_MS = 8_000

/** What only this device keeps. */
interface Stored {
  /** demo runs, and real runs from before this device reached a controller that keeps runs */
  runs: Run[]
  /** suggestion id -> completed-run count when the person chose "don't show again" */
  snoozed: Record<string, number>
  seededDemo?: boolean
  /** the suggestion pop-up shown per run and stage, so there is at most one each */
  tips: Record<string, Partial<Record<StageId, string>>>
  /** the last reminder sent per run */
  sent: Record<string, string>
}

const EMPTY: Stored = { runs: [], snoozed: {}, tips: {}, sent: {} }

/** Where a run is saved, for the line under it. */
export type SyncStatus = "saved" | "saving" | "waiting" | "offline" | "remote" | "device"

interface RunsContextValue {
  activeRun: (tumblerId: number) => Run | undefined
  /** finished runs (completed or overridden), newest first */
  history: (tumblerId: number) => Run[]
  start: (tumblerId: number, hideWeightKg: number) => void
  override: (tumblerId: number, reason: string) => void
  dispatch: (runId: string, op: RunOp) => void
  snoozed: Record<string, number>
  snooze: (tipId: string, completedRuns: number) => void
  tipsShown: (runId: string) => Partial<Record<StageId, string>>
  markTip: (runId: string, stage: StageId, tipId: string) => void
  /** null for demo runs */
  syncStatus: (run: Run) => SyncStatus | null
  notices: (tumblerId: number) => readonly Notice[]
  dismissNotice: (noticeId: string) => void
}

const RunsContext = createContext<RunsContextValue | null>(null)

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

type OldRun = Run & { tipsShown?: Partial<Record<StageId, string>>; alert?: { key: string } }

/** Earlier versions kept the pop-ups shown and the last reminder inside each run; they now sit beside the runs. */
function readStored(raw: string | null): Stored {
  if (!raw) return EMPTY
  const parsed = JSON.parse(raw) as Partial<Omit<Stored, "runs">> & { runs?: OldRun[] }
  const tips = { ...parsed.tips }
  const sent = { ...parsed.sent }
  const runs = (Array.isArray(parsed.runs) ? parsed.runs : []).map(({ tipsShown, alert, ...run }) => {
    if (tipsShown && Object.keys(tipsShown).length) tips[run.id] = tipsShown
    if (alert) sent[run.id] = alert.key
    return run
  })
  return { runs, snoozed: parsed.snoozed ?? {}, seededDemo: parsed.seededDemo, tips, sent }
}

export function RunsProvider({ children }: { children: React.ReactNode }) {
  const { demoMode, connectionStatus, subscribe } = useDashboard()
  const { tumblers } = useTumblers()
  const [store, setStore] = useState<Stored>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [sync] = useState(() => new RunSync(applyChanges))
  const synced = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getServerSnapshot)
  const storeRef = useRef(store)
  storeRef.current = store
  const tumblersRef = useRef(tumblers)
  tumblersRef.current = tumblers
  const lastSample = useRef(0)
  const importing = useRef(false)

  // load once; seed a run in progress on demo Tumbler 3 the first time Demo Mode is seen
  useEffect(() => {
    let next = EMPTY
    try {
      next = readStored(localStorage.getItem(STORAGE_KEY))
      localStorage.removeItem(OLD_SETUP_KEY)
    } catch {
      // unreadable or blocked storage: start fresh
    }
    if (getSettings().demoMode && !next.seededDemo) {
      next = { ...next, seededDemo: true, runs: [...next.runs, seededActiveRun(3, seededHistory(3).length + 1)] }
    }
    setStore(next)
    setLoaded(true)
    sync.load()
  }, [sync])

  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    } catch {
      // storage unavailable: runs just won't survive a reload
    }
  }, [store, loaded])

  // real runs: keep in step with the controller, and catch up whenever the connection comes back
  useEffect(() => {
    if (demoMode || !loaded) return
    sync.start()
    return sync.stop
  }, [demoMode, loaded, sync])
  useEffect(() => {
    if (!demoMode && loaded && connectionStatus === "connected") void sync.refresh()
  }, [demoMode, loaded, connectionStatus, sync])
  useEffect(() => subscribe("run_updated", (msg) => sync.remoteChanged(msg.seq)), [subscribe, sync])

  // real runs kept on this device move to the controller the first time it can take them
  useEffect(() => {
    if (demoMode || !synced.controllerId || !synced.online || importing.current) return
    const local = store.runs.filter((r) => !r.demo)
    if (!local.length) return
    importing.current = true
    void sync
      .importLocal(local)
      .then((ok) => {
        if (!ok) return
        const moved = new Set(local.map((r) => r.id))
        setStore((s) => ({ ...s, runs: s.runs.filter((r) => !moved.has(r.id)) }))
      })
      .finally(() => (importing.current = false))
  }, [demoMode, synced.controllerId, synced.online, store.runs, sync])

  const seeded = useMemo(() => (demoMode ? [3, 5].flatMap((id) => seededHistory(id)) : []), [demoMode])

  /** every run on show: the demo ones in Demo Mode, otherwise the controller's plus any still kept here */
  const runs = useMemo(() => {
    if (demoMode) return store.runs.filter((r) => r.demo)
    const shared = new Set(synced.runs.map((r) => r.id))
    return [...synced.runs, ...store.runs.filter((r) => !r.demo && !shared.has(r.id))]
  }, [demoMode, store.runs, synced.runs])
  const runsRef = useRef(runs)
  runsRef.current = runs

  // one clock for every run: sample readings into the runs kept here, and send each reminder once
  useEffect(() => {
    const id = setInterval(() => {
      const now = clockNow()
      if (now - lastSample.current >= SAMPLE_EVERY_MS) {
        lastSample.current = now
        const live = tumblersRef.current
        setStore((s) => {
          let changed = false
          const next = s.runs.map((r) => {
            const t = r.status === "active" ? live.find((x) => x.id === r.tumblerId) : undefined
            const out = t ? sample(r, t) : r
            if (out !== r) changed = true
            return out
          })
          return changed ? { ...s, runs: next } : s
        })
      }
      for (const r of runsRef.current) {
        const due = reminderOf(r, now)
        if (!due || storeRef.current.sent[r.id] === due.key) continue
        storeRef.current = { ...storeRef.current, sent: { ...storeRef.current.sent, [r.id]: due.key } }
        setStore((s) => ({ ...s, sent: { ...s.sent, [r.id]: due.key } }))
        if (now - due.dueAt < REMIND_WITHIN_MS) void sendLocalNotification(due.title, due.body).catch(() => {})
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const activeRun = useCallback((tumblerId: number) => runs.find((r) => r.tumblerId === tumblerId && r.status === "active"), [runs])

  const history = useCallback(
    (tumblerId: number) =>
      [...seeded, ...runs]
        .filter((r) => r.tumblerId === tumblerId && r.status !== "active")
        .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0)),
    [seeded, runs],
  )

  const dispatch = useCallback(
    (runId: string, op: RunOp) => {
      const at = clockNow()
      if (storeRef.current.runs.some((r) => r.id === runId))
        setStore((s) => ({ ...s, runs: s.runs.map((r) => (r.id === runId ? (applyOp(r, op, at) ?? r) : r)) }))
      else sync.dispatch(runId, op, at)
    },
    [sync],
  )

  const start = useCallback(
    (tumblerId: number, hideWeightKg: number) => {
      if (activeRun(tumblerId)) return
      const now = clockNow()
      const run: Run = {
        id: newId(),
        // the controller keeps a capped history, so count on from the highest number rather than the length
        number: Math.max(0, ...history(tumblerId).map((r) => r.number)) + 1,
        tumblerId,
        demo: demoMode,
        recipeId: RECIPE.id,
        hideWeightKg,
        startedAt: now,
        status: "active",
        stage: 0,
        step: 0,
        steps: {},
        stageStartedAt: { [RECIPE.stages[0].id]: now },
        stageEndedAt: {},
        passed: {},
        sensors: {},
      }
      if (!demoMode && synced.controllerId) {
        sync.dispatch(run.id, { type: "create", run }, now)
        return
      }
      setStore((s) =>
        s.runs.some((r) => r.tumblerId === tumblerId && r.status === "active" && r.demo === demoMode) ? s : { ...s, runs: [...s.runs, run] },
      )
    },
    [activeRun, history, demoMode, synced.controllerId, sync],
  )

  const override = useCallback(
    (tumblerId: number, reason: string) => {
      const run = activeRun(tumblerId)
      if (run) dispatch(run.id, { type: "override", reason })
    },
    [activeRun, dispatch],
  )

  const snooze = useCallback((tipId: string, completedRuns: number) => {
    setStore((s) => ({ ...s, snoozed: { ...s.snoozed, [tipId]: completedRuns } }))
  }, [])

  const tipsShown = useCallback((runId: string) => store.tips[runId] ?? {}, [store.tips])
  const markTip = useCallback((runId: string, stage: StageId, tipId: string) => {
    setStore((s) => ({ ...s, tips: { ...s.tips, [runId]: { ...s.tips[runId], [stage]: tipId } } }))
  }, [])

  const syncStatus = useCallback(
    (run: Run): SyncStatus | null => {
      if (run.demo) return null
      if (store.runs.some((r) => r.id === run.id)) return "device"
      if (synced.pending.has(run.id)) return synced.online ? "saving" : "waiting"
      if (!synced.online) return "offline"
      return Date.now() - (synced.remoteAt[run.id] ?? 0) < REMOTE_FLASH_MS ? "remote" : "saved"
    },
    [store.runs, synced],
  )

  const notices = useCallback((tumblerId: number) => synced.notices.filter((n) => n.tumblerId === tumblerId), [synced.notices])

  const value = useMemo(
    () => ({
      activeRun,
      history,
      start,
      override,
      dispatch,
      snoozed: store.snoozed,
      snooze,
      tipsShown,
      markTip,
      syncStatus,
      notices,
      dismissNotice: sync.dismiss,
    }),
    [activeRun, history, start, override, dispatch, store.snoozed, snooze, tipsShown, markTip, syncStatus, notices, sync],
  )
  return <RunsContext.Provider value={value}>{children}</RunsContext.Provider>
}

export function useRuns() {
  const ctx = useContext(RunsContext)
  if (!ctx) throw new Error("useRuns must be used within RunsProvider")
  return ctx
}

/** Everything a screen can do to one run, bound to it. */
export function useRunActions(run: Run) {
  const { dispatch, markTip } = useRuns()
  return useMemo(() => {
    const send = (op: RunOp) => dispatch(run.id, op)
    const state = (key: string) => stepStateOf(run, key)
    return {
      toggleAdded: (key: string, i: number) => send({ type: "added", key, i, value: !state(key).added[i] }),
      toggleTask: (key: string, i: number) => send({ type: "task", key, i, value: !state(key).tasks[i] }),
      chooseMinutes: (key: string, minutes: number) => send({ type: "minutes", key, minutes }),
      startTimer: (key: string) => send({ type: "timer", key, action: "start" }),
      pauseTimer: (key: string) => send({ type: "timer", key, action: "pause" }),
      resetTimer: (key: string) => send({ type: "timer", key, action: "reset" }),
      startExtra: (key: string, minutes: number) => send({ type: "extra", key, action: "start", minutes }),
      pauseExtra: (key: string) => send({ type: "extra", key, action: "pause" }),
      resumeExtra: (key: string) => send({ type: "extra", key, action: "resume" }),
      measure: (key: string, value: number) => send({ type: "measure", key, value }),
      answer: (key: string, yes: boolean) => send({ type: "answer", key, yes }),
      accept: (key: string) => send({ type: "accept", key }),
      next: (early = false) => send({ type: "next", stage: run.stage, step: run.step, early }),
      passStage: (passed: boolean[]) => send({ type: "pass", stage: run.stage, passed }),
      complete: (quality: Quality, note: string) => send({ type: "complete", quality, note }),
      tipShown: (stage: StageId, tipId: string) => markTip(run.id, stage, tipId),
    }
  }, [run, dispatch, markTip])
}
