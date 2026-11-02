// Made-up run history for demo Tumblers 3 and 5, so the run suggestions can be tried before real runs exist.
// Tumbler 3 has enough runs for patterns, Tumbler 5 only enough for "usual range" warnings, Tumbler 1 none.
// It is deterministic, flagged demo, never saved and never mixed with real runs.

import { RECIPE, stageMinutes, stepKey, type StageId } from "@/lib/recipe"
import type { Agg, Quality, Run, StepState } from "@/lib/runs"

const COUNTS: Record<number, number> = { 3: 12, 5: 6 }
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function rng(seed: number) {
  let s = seed % 2147483647 || 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}
const round = (v: number, d = 2) => Number(v.toFixed(d))

/** An aggregate that looks like `n` readings around `mean`. */
function agg(mean: number, spread: number, n = 120): Agg {
  return { n, sum: mean * n, sumSq: n * (spread * spread + mean * mean), min: mean - 2 * spread, max: mean + 2 * spread }
}

/** Every step up to (not including) stage/step marked done, each product added and task ticked. */
function doneUpTo(stage: number, step: number, at: number): Record<string, StepState> {
  const out: Record<string, StepState> = {}
  RECIPE.stages.forEach((st, si) =>
    st.steps.forEach((sp, i) => {
      if (si > stage || (si === stage && i >= step)) return
      out[stepKey(st, sp)] = {
        added: (sp.adds ?? []).map(() => true),
        tasks: (sp.tasks ?? []).map(() => true),
        extraTotalMin: 0,
        measured: [],
        doneAt: at,
      }
    }),
  )
  return out
}

const set = (steps: Record<string, StepState>, key: string, patch: Partial<StepState>) => {
  steps[key] = { ...(steps[key] ?? { added: [], tasks: [], extraTotalMin: 0, measured: [] }), ...patch }
}

/** Stage start/end times laid end to end from `startedAt`, liming stretched by any extra running. */
function stageTimes(startedAt: number, limingExtraMin: number, upTo = RECIPE.stages.length) {
  const started: Partial<Record<StageId, number>> = {}
  const ended: Partial<Record<StageId, number>> = {}
  let t = startedAt
  RECIPE.stages.slice(0, upTo + 1).forEach((s, i) => {
    started[s.id] = t
    if (i === upTo) return
    t += (stageMinutes(s) + (s.id === "liming" ? limingExtraMin : 0) + 20) * MIN
    ended[s.id] = t
  })
  return { started, ended }
}

function pastRun(tumblerId: number, number: number, endedAt: number, rand: () => number): Run {
  const weight = Math.round(140 + rand() * 80)
  const limingRpm = 9 + rand() * 6
  const pickleTemp = 25 + rand() * 9
  const pickleRpm = 10 + rand() * 4
  // built-in patterns: a faster drum in liming gives a higher pH sooner; a warmer pickle gives a lower pH
  const limingFirst = round(10.3 + (limingRpm - 9) * 0.17 + (rand() - 0.5) * 0.3)
  const limingExtra = limingFirst < 11 ? Math.ceil((11 - limingFirst) / 0.25) * 15 : 0
  const picklePh = round(5.3 - (pickleTemp - 25) * 0.11 + (rand() - 0.5) * 0.3)
  const delimingPh = round(6.3 + rand() * 0.6)
  const density = round(6 + rand() * 0.9, 1)
  const soakMin = rand() > 0.5 ? 60 : 30
  const quality: Quality = picklePh < 3.9 ? "poor" : picklePh > 5.05 || limingExtra > 45 ? "issues" : "good"
  const startedAt = endedAt - (36 + limingExtra / 60 + rand() * 2) * HOUR
  const { started, ended } = stageTimes(startedAt, limingExtra)

  const steps = doneUpTo(RECIPE.stages.length, 0, endedAt)
  set(steps, "soaking.first-bath", { minutes: soakMin })
  set(steps, "soaking.second-bath", { minutes: soakMin })
  set(steps, "liming.ph-check", {
    measured: limingFirst < 11 ? [limingFirst, round(11 + rand() * 0.3)] : [limingFirst],
    extraTotalMin: limingExtra,
  })
  set(steps, "deliming.cut-check", { confirmed: true })
  set(steps, "deliming.ph-check", { measured: [delimingPh] })
  set(steps, "pickling.density", { measured: [density] })
  set(steps, "pickling.ph-check", { measured: [picklePh], accepted: picklePh < 4 || picklePh > 5 })

  return {
    id: `demo-${tumblerId}-${number}`,
    number,
    tumblerId,
    demo: true,
    recipeId: RECIPE.id,
    hideWeightKg: weight,
    startedAt,
    endedAt,
    status: "completed",
    stage: RECIPE.stages.length,
    step: 0,
    steps,
    stageStartedAt: started,
    stageEndedAt: ended,
    passed: Object.fromEntries(RECIPE.stages.map((s) => [s.id, s.passChecks.map(() => true)])),
    sensors: {
      soaking: { temp: agg(22 + rand(), 0.4), ph: agg(7.6, 0.1), rpm: agg(12, 0.3) },
      liming: { temp: agg(24 + rand(), 0.5), ph: agg(limingFirst + 0.1, 0.12), rpm: agg(limingRpm, 0.4) },
      deliming: { temp: agg(30 + rand(), 0.5), ph: agg(delimingPh, 0.1), rpm: agg(12, 0.3) },
      pickling: { temp: agg(pickleTemp, 0.6), ph: agg(picklePh, 0.1), rpm: agg(pickleRpm, 0.4) },
      tanning: { temp: agg(32 + rand(), 0.5), ph: agg(4.3, 0.1), rpm: agg(12, 0.3) },
    },
    outcome: { quality, note: "" },
  }
}

const cache = new Map<number, Run[]>()

/** Finished demo runs for a tumbler, oldest first. One of Tumbler 3's was overridden, like a forgotten run would be. */
export function seededHistory(tumblerId: number): Run[] {
  const hit = cache.get(tumblerId)
  if (hit) return hit
  const count = COUNTS[tumblerId] ?? 0
  const rand = rng(tumblerId * 7919)
  const base = Date.now() - 2 * DAY
  const runs = Array.from({ length: count }, (_, i) => {
    const r = pastRun(tumblerId, i + 1, base - (count - 1 - i) * 2.5 * DAY, rand)
    if (tumblerId !== 3 || i !== 6) return r
    return { ...r, status: "overridden" as const, stage: 2, outcome: undefined, overrideReason: "Run wasn't logged in the app" }
  })
  cache.set(tumblerId, runs)
  return runs
}

/** A run partway through pickling: the oil and acid are in and the 2-hour run is 35 minutes along. */
export function seededActiveRun(tumblerId: number, number: number): Run {
  const now = Date.now()
  const pickling = RECIPE.stages.findIndex((s) => s.id === "pickling")
  const startedAt = now - 31 * HOUR
  const { started, ended } = stageTimes(startedAt, 15, pickling)
  const steps = doneUpTo(pickling, 2, now - 40 * MIN)
  set(steps, "soaking.first-bath", { minutes: 30 })
  set(steps, "soaking.second-bath", { minutes: 30 })
  set(steps, "liming.ph-check", { measured: [10.8, 11.2], extraTotalMin: 15 })
  set(steps, "deliming.cut-check", { confirmed: true })
  set(steps, "deliming.ph-check", { measured: [6.5] })
  set(steps, "pickling.density", { measured: [6.4] })
  set(steps, "pickling.acid", { added: [true, true], timer: { startedAt: now - 35 * MIN, elapsedMs: 0 } })

  return {
    id: `demo-active-${tumblerId}`,
    number,
    tumblerId,
    demo: true,
    recipeId: RECIPE.id,
    hideWeightKg: 180,
    startedAt,
    status: "active",
    stage: pickling,
    step: 2,
    steps,
    stageStartedAt: started,
    stageEndedAt: ended,
    passed: Object.fromEntries(RECIPE.stages.slice(0, pickling).map((s) => [s.id, s.passChecks.map(() => true)])),
    sensors: {
      soaking: { temp: agg(22.4, 0.4), ph: agg(7.6, 0.1), rpm: agg(12, 0.3) },
      liming: { temp: agg(24.3, 0.5), ph: agg(11, 0.12), rpm: agg(11, 0.4) },
      deliming: { temp: agg(30.2, 0.5), ph: agg(6.5, 0.1), rpm: agg(12, 0.3) },
    },
  }
}
