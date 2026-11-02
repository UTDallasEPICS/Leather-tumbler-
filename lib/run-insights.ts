// Suggestions and warnings learned from a tumbler's finished runs. Nothing shows until there is enough
// history to say something: "usual range" warnings need MIN_RUNS_TYPICAL completed runs, and patterns
// ("what moves pH") need MIN_RUNS_PATTERNS plus a clear correlation. Overridden runs are left out.

import { RECIPE, type Action, type CheckKey, type Stage, type StageId } from "@/lib/recipe"
import { meanOf, stepStateOf, type Run, type SensorKey } from "@/lib/runs"

export const MIN_RUNS_TYPICAL = 5
export const MIN_RUNS_PATTERNS = 8
/** how strong a correlation has to be (|r|) before it becomes a suggestion */
const MIN_CORRELATION = 0.5
/** a suggestion the person silenced comes back once this many more runs are logged */
export const RESHOW_AFTER_RUNS = 5

export interface Suggestion {
  id: string
  /** the stage where it can be acted on; "start" for the batch itself */
  stage: StageId | "start"
  title: string
  text: string
  detail: string
  strength: number
}

const completedOnly = (history: Run[]) => history.filter((r) => r.status === "completed")
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]) => {
  const m = avg(xs)
  return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)))
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const stageName = (id: StageId) => RECIPE.stages.find((s) => s.id === id)!.name.toLowerCase()

// ---- reading what a run recorded --------------------------------------------------------------

const CHECKS = new Map<CheckKey, { stage: Stage; key: string; action: Extract<Action, { kind: "measure" | "confirm" }> }>()
for (const stage of RECIPE.stages)
  for (const step of stage.steps)
    if (step.action?.kind === "measure" || step.action?.kind === "confirm")
      CHECKS.set(step.action.key, { stage, key: `${stage.id}.${step.id}`, action: step.action })

/** First and last answer at a check, and the extra running it needed. */
export function checkResult(run: Run, key: CheckKey): { first: number | boolean; last: number | boolean; extraMin: number } | null {
  const c = CHECKS.get(key)
  if (!c) return null
  const s = stepStateOf(run, c.key)
  if (c.action.kind === "confirm") return s.confirmed === undefined ? null : { first: s.confirmed, last: s.confirmed, extraMin: s.extraTotalMin }
  if (!s.measured.length) return null
  return { first: s.measured[0], last: s.measured[s.measured.length - 1], extraMin: s.extraTotalMin }
}

interface Feature {
  id: string
  label: string
  short: string
  unit: string
  decimals: number
  stage?: StageId
  target?: [number, number]
  get: (r: Run) => number | null
}

const fmt = (f: Feature, v: number) => `${v.toFixed(f.decimals)}${f.unit}`

const SENSOR_LABEL: Record<SensorKey, { label: string; short: string; unit: string; decimals: number }> = {
  temp: { label: "drum temperature", short: "temperature", unit: "°C", decimals: 1 },
  ph: { label: "pH", short: "pH", unit: "", decimals: 2 },
  rpm: { label: "drum speed", short: "drum speed", unit: " rpm", decimals: 0 },
}

const sensor = (stage: StageId, m: SensorKey): Feature => ({
  id: `${stage}.${m}`,
  label: `${SENSOR_LABEL[m].label} during ${stageName(stage)}`,
  short: SENSOR_LABEL[m].short,
  unit: SENSOR_LABEL[m].unit,
  decimals: SENSOR_LABEL[m].decimals,
  stage,
  get: (r) => meanOf(r.sensors[stage]?.[m]),
})

const firstReading = (key: CheckKey, label: string, short: string, unit: string): Feature => {
  const c = CHECKS.get(key)!
  return {
    id: key,
    label,
    short,
    unit,
    decimals: 2,
    stage: c.stage.id,
    target: c.action.kind === "measure" ? c.action.target : undefined,
    get: (r) => {
      const v = checkResult(r, key)?.first
      return typeof v === "number" ? v : null
    },
  }
}

const QUALITY_SCORE = { good: 2, issues: 1, poor: 0 } as const

const F: Record<string, Feature> = {
  weight: { id: "weight", label: "the batch weight", short: "batch weight", unit: " kg", decimals: 0, get: (r) => r.hideWeightKg },
  soak: {
    id: "soakMinutes",
    label: "the soak time",
    short: "soak time",
    unit: " min",
    decimals: 0,
    stage: "soaking",
    get: (r) => {
      const a = stepStateOf(r, "soaking.first-bath").minutes
      const b = stepStateOf(r, "soaking.second-bath").minutes
      return a || b ? (a ?? 30) + (b ?? 30) : null
    },
  },
  limingPh: firstReading("limingPh", "the first liming pH reading", "liming pH", ""),
  limingExtra: {
    id: "limingExtra",
    label: "the extra running needed to reach pH 11",
    short: "extra liming time",
    unit: " min",
    decimals: 0,
    stage: "liming",
    get: (r) => checkResult(r, "limingPh")?.extraMin ?? null,
  },
  delimingPh: firstReading("delimingPh", "the deliming pH", "deliming pH", ""),
  picklePh: firstReading("picklePh", "the pickle pH", "pickle pH", ""),
  quality: {
    id: "quality",
    label: "leather quality",
    short: "leather quality",
    unit: "",
    decimals: 1,
    get: (r) => (r.outcome ? QUALITY_SCORE[r.outcome.quality] : null),
  },
}

/** [factor someone can act on, result it may move] */
const PAIRS: [Feature, Feature][] = [
  [F.weight, F.limingExtra],
  [F.weight, F.quality],
  [F.soak, F.quality],
  [sensor("liming", "rpm"), F.limingPh],
  [sensor("liming", "rpm"), F.limingExtra],
  [sensor("liming", "temp"), F.limingPh],
  [sensor("deliming", "temp"), F.delimingPh],
  [sensor("pickling", "temp"), F.picklePh],
  [sensor("pickling", "rpm"), F.picklePh],
  [sensor("pickling", "temp"), F.quality],
  [sensor("tanning", "temp"), F.quality],
  [sensor("tanning", "rpm"), F.quality],
]

function correlation(xs: number[], ys: number[]): number {
  const mx = avg(xs)
  const my = avg(ys)
  let num = 0
  let dx = 0
  let dy = 0
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my)
    dx += (x - mx) ** 2
    dy += (ys[i] - my) ** 2
  })
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** Patterns between what was done in a run and how it came out, strongest first. */
export function suggestionsFor(history: Run[], tumblerName: string): Suggestion[] {
  const runs = completedOnly(history)
  if (runs.length < MIN_RUNS_PATTERNS) return []
  const out: Suggestion[] = []

  for (const [f, m] of PAIRS) {
    const pts = runs.map((r) => [f.get(r), m.get(r)] as const).filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null)
    if (pts.length < MIN_RUNS_PATTERNS) continue
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const r = correlation(xs, ys)
    if (Math.abs(r) < MIN_CORRELATION) continue
    const mid = median(xs)
    const hi = pts.filter((p) => p[0] > mid)
    const lo = pts.filter((p) => p[0] <= mid)
    if (hi.length < 3 || lo.length < 3) continue
    const diff = avg(hi.map((p) => p[1])) - avg(lo.map((p) => p[1]))

    let text: string
    if (m === F.quality) {
      text = `Leather turned out better in runs where ${f.label} was ${diff > 0 ? "above" : "at or below"} ${fmt(f, mid)}.`
    } else {
      text = `${cap(m.label)} was ${fmt(m, Math.abs(diff))} ${diff > 0 ? "higher" : "lower"} in runs where ${f.label} was above ${fmt(f, mid)}.`
      if (m.target) {
        const hit = (g: (readonly [number, number])[]) => g.filter((p) => p[1] >= m.target![0] && p[1] <= m.target![1]).length / g.length
        const [a, b] = [hit(hi), hit(lo)]
        if (Math.abs(a - b) >= 0.3) {
          text += ` ${Math.round(a * 100)}% of those runs hit the ${m.target[0]}–${m.target[1]} target, against ${Math.round(b * 100)}% of the rest.`
        }
      }
    }
    out.push({
      id: `${f.id}~${m.id}`,
      stage: f.stage ?? m.stage ?? "start",
      title: `${cap(f.short)} and ${m.short}`,
      text,
      detail: `${Math.abs(r) >= 0.7 ? "Strong" : "Moderate"} pattern across ${pts.length} completed runs on ${tumblerName}.`,
      strength: Math.abs(r),
    })
  }
  return out.sort((a, b) => b.strength - a.strength)
}

export const isSnoozed = (s: Suggestion, snoozed: Record<string, number>, completed: number) =>
  snoozed[s.id] !== undefined && completed < snoozed[s.id] + RESHOW_AFTER_RUNS

// ---- usual ranges ---------------------------------------------------------------------------------

export interface Band {
  lo: number
  hi: number
  mean: number
  n: number
}

// a narrower "usual" band than this would flag ordinary sensor noise
const BAND_FLOOR: Record<SensorKey, number> = { temp: 1.5, ph: 0.2, rpm: 1 }

function band(values: number[], floor: number): Band | null {
  if (values.length < MIN_RUNS_TYPICAL) return null
  const mean = avg(values)
  const half = Math.max(2 * sd(values), floor)
  return { lo: mean - half, hi: mean + half, mean, n: values.length }
}

export function sensorBand(history: Run[], stage: StageId, m: SensorKey): Band | null {
  const values = completedOnly(history)
    .map((r) => meanOf(r.sensors[stage]?.[m]))
    .filter((v): v is number => v !== null)
  return band(values, BAND_FLOOR[m])
}

export interface LiveWarning {
  id: string
  text: string
}

/** Live readings outside what this stage usually sees on this tumbler. */
export function liveWarnings(
  history: Run[],
  stage: Stage,
  live: Record<SensorKey, number | null>,
  tumblerName: string,
): LiveWarning[] {
  const out: LiveWarning[] = []
  for (const m of ["temp", "ph", "rpm"] as SensorKey[]) {
    const v = live[m]
    const b = v === null ? null : sensorBand(history, stage.id, m)
    if (v === null || !b || (v >= b.lo && v <= b.hi)) continue
    const l = SENSOR_LABEL[m]
    const num = (x: number) => x.toFixed(l.decimals)
    const name = m === "ph" ? "pH" : cap(l.short)
    out.push({
      id: `${stage.id}.${m}`,
      text: `${name} is ${num(v)}${l.unit}, ${v > b.hi ? "higher" : "lower"} than usual for ${stage.name.toLowerCase()} on ${tumblerName} (usually ${num(b.lo)}–${num(b.hi)}${l.unit}, from ${b.n} runs).`,
    })
  }
  return out
}

/** One line of history under a check: what it usually reads here, and what a low reading cost before. */
export function checkContext(history: Run[], key: CheckKey, tumblerName: string): string | null {
  const results = completedOnly(history)
    .map((r) => checkResult(r, key))
    .filter((x): x is NonNullable<typeof x> => x !== null)
  if (results.length < MIN_RUNS_TYPICAL) return null
  if (typeof results[0].first === "boolean") {
    const passed = results.filter((x) => x.first === true).length
    return `Passed first time in ${passed} of ${results.length} runs on ${tumblerName}.`
  }
  const firsts = results.map((x) => x.first as number)
  let line = `Usually reads ${avg(firsts).toFixed(2)} here on ${tumblerName} (${results.length} runs).`
  const extra = results.filter((x) => x.extraMin > 0)
  if (extra.length) {
    line += ` When it came in short, ${extra.length === 1 ? "it" : "they"} needed about ${Math.round(avg(extra.map((x) => x.extraMin)))} min more running.`
  }
  return line
}

// ---- history at a glance --------------------------------------------------------------------------

export function historySummary(history: Run[]) {
  const done = completedOnly(history)
  const hours = done.map((r) => ((r.endedAt ?? r.startedAt) - r.startedAt) / 3_600_000)
  return {
    completed: done.length,
    overridden: history.filter((r) => r.status === "overridden").length,
    avgHours: hours.length ? avg(hours) : null,
    goodShare: done.length ? done.filter((r) => r.outcome?.quality === "good").length / done.length : null,
  }
}
