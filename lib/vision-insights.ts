// What the inspection numbers say: how good the model is, which defects show up, and which parts of the
// process go with more defects. Pure functions over inspections and runs, so demo and real data share them.

import { RECIPE, type CheckKey, type StageId } from "@/lib/recipe"
import { checkResult } from "@/lib/run-insights"
import { meanOf, type Run, type SensorKey } from "@/lib/runs"
import { defectName, flagged, isDefect, type Inspection, type VisionMetrics } from "@/lib/vision"

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]) => {
  const m = avg(xs)
  return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)))
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
export const pct = (x: number) => `${Math.round(x * 100)}%`

// ---- how good is the model --------------------------------------------------------------------

export interface TestRates {
  defects: number
  caught: number
  good: number
  falseAlarms: number
  accuracy: number
  perType: { type: string; n: number; caught: number }[]
}

/** Catch rate and false alarms on the held-back test photos, at any sensitivity. */
export function testRates(m: VisionMetrics, threshold: number): TestRates {
  const defects = m.scores.filter((s) => s.type !== "good")
  const good = m.scores.filter((s) => s.type === "good")
  const caught = defects.filter((s) => s.score >= threshold).length
  const falseAlarms = good.filter((s) => s.score >= threshold).length
  const types = [...new Set(defects.map((s) => s.type))].sort()
  return {
    defects: defects.length,
    caught,
    good: good.length,
    falseAlarms,
    accuracy: m.scores.length ? (caught + good.length - falseAlarms) / m.scores.length : 0,
    perType: types.map((type) => {
      const g = defects.filter((s) => s.type === type)
      return { type, n: g.length, caught: g.filter((s) => s.score >= threshold).length }
    }),
  }
}

export interface PeopleCheck {
  checked: number
  agreed: number
  defects: number
  caught: number
  good: number
  falseAlarms: number
}

/** How the model did on our own photos, where a person said what each one really was. */
export function peopleCheck(list: Inspection[], threshold: number): PeopleCheck {
  const checked = list.filter((i) => i.label)
  const defects = checked.filter((i) => i.label !== "good")
  const good = checked.filter((i) => i.label === "good")
  const caught = defects.filter((i) => flagged(i, threshold)).length
  const falseAlarms = good.filter((i) => flagged(i, threshold)).length
  return { checked: checked.length, agreed: caught + good.length - falseAlarms, defects: defects.length, caught, good: good.length, falseAlarms }
}

// ---- what defects are showing up --------------------------------------------------------------

export function defectBreakdown(list: Inspection[], threshold: number) {
  const defective = list.filter((i) => isDefect(i, threshold))
  const counts = new Map<string, number>()
  for (const i of defective) if (i.label) counts.set(i.label, (counts.get(i.label) ?? 0) + 1)
  return {
    total: list.length,
    defective: defective.length,
    /** flagged by the model, nobody has said what it is yet */
    unchecked: defective.filter((i) => !i.label).length,
    byType: [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
  }
}

export interface RunDefects {
  run: Run
  photos: number
  defective: number
  rate: number
  types: Record<string, number>
}

/** Each run that has inspection photos, oldest first. */
export function runDefects(runs: Run[], list: Inspection[], threshold: number): RunDefects[] {
  const byRun = new Map<string, Inspection[]>()
  for (const i of list) if (i.runId) byRun.set(i.runId, [...(byRun.get(i.runId) ?? []), i])
  return runs
    .filter((r) => r.status !== "overridden" && byRun.has(r.id))
    .map((run) => {
      const photos = byRun.get(run.id)!
      const bad = photos.filter((i) => isDefect(i, threshold))
      const types: Record<string, number> = {}
      for (const i of bad) if (i.label) types[i.label] = (types[i.label] ?? 0) + 1
      return { run, photos: photos.length, defective: bad.length, rate: bad.length / photos.length, types }
    })
    .sort((a, b) => a.run.startedAt - b.run.startedAt)
}

// ---- which parts of the process go with defects --------------------------------------------------

export interface Factor {
  id: string
  label: string
  stage: StageId | "start"
  unit: string
  decimals: number
  get: (r: Run) => number | null
}

const stageName = (id: StageId) => RECIPE.stages.find((s) => s.id === id)!.name.toLowerCase()
const SENSOR: Record<SensorKey, { label: string; unit: string; decimals: number }> = {
  temp: { label: "temperature", unit: "°C", decimals: 1 },
  ph: { label: "pH", unit: "", decimals: 2 },
  rpm: { label: "drum speed", unit: " rpm", decimals: 0 },
}

const sensorFactor = (stage: StageId, m: SensorKey): Factor => ({
  id: `${stage}.${m}`,
  label: `${stageName(stage)} ${SENSOR[m].label}`,
  stage,
  unit: SENSOR[m].unit,
  decimals: SENSOR[m].decimals,
  get: (r) => meanOf(r.sensors[stage]?.[m]),
})

const checkFactor = (key: CheckKey, label: string, stage: StageId): Factor => ({
  id: key,
  label,
  stage,
  unit: "",
  decimals: 2,
  get: (r) => {
    const v = checkResult(r, key)?.first
    return typeof v === "number" ? v : null
  },
})

export const FACTORS: Factor[] = [
  { id: "weight", label: "batch weight", stage: "start", unit: " kg", decimals: 0, get: (r) => r.hideWeightKg },
  ...RECIPE.stages.flatMap((s) => (["temp", "ph", "rpm"] as SensorKey[]).map((m) => sensorFactor(s.id, m))),
  checkFactor("limingPh", "the first liming pH reading", "liming"),
  checkFactor("delimingPh", "the deliming pH reading", "deliming"),
  checkFactor("picklePh", "the pickle pH reading", "pickling"),
]

export const fmtFactor = (f: Factor, v: number) => `${v.toFixed(f.decimals)}${f.unit}`

/** Runs needed before a pattern is shown at all. */
export const MIN_RUNS = 6
/** how strong a correlation has to be (|r|), the same bar as the run suggestions in lib/run-insights.ts */
const MIN_R = 0.5
/** the two halves' defect rates must differ by this much, and one must be at least double the other */
const MIN_GAP = 0.1

export interface Pattern {
  id: string
  factor: Factor
  stage: StageId | "start"
  title: string
  text: string
  advice: string
  detail: string
  /** the split point, and which side of it went with more defects */
  mid: number
  worseAbove: boolean
  rateAbove: number
  rateBelow: number
  strength: number
}

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

const pooledRate = (g: RunDefects[]) => g.reduce((n, r) => n + r.defective, 0) / Math.max(1, g.reduce((n, r) => n + r.photos, 0))

/** Process readings that went with more (or fewer) defective hides, strongest first. */
export function processPatterns(stats: RunDefects[]): Pattern[] {
  if (stats.length < MIN_RUNS) return []
  const out: Pattern[] = []
  // two readings that split the runs the same way (the pickling pH sensor and the pickle pH check) say one thing
  const seen = new Set<string>()
  for (const f of FACTORS) {
    const pts = stats.map((s) => ({ s, v: f.get(s.run) })).filter((p): p is { s: RunDefects; v: number } => p.v !== null)
    if (pts.length < MIN_RUNS) continue
    const r = correlation(
      pts.map((p) => p.v),
      pts.map((p) => p.s.rate),
    )
    if (Math.abs(r) < MIN_R) continue
    const mid = median(pts.map((p) => p.v))
    const above = pts.filter((p) => p.v > mid).map((p) => p.s)
    const below = pts.filter((p) => p.v <= mid).map((p) => p.s)
    if (above.length < 3 || below.length < 3) continue
    const [ra, rb] = [pooledRate(above), pooledRate(below)]
    if (Math.abs(ra - rb) < MIN_GAP || Math.max(ra, rb) < 2 * Math.min(ra, rb)) continue
    const worseAbove = ra > rb
    const groups = [above, below].map((g) => g.map((s) => s.run.id).sort().join(",")).sort().join("|")
    if (seen.has(groups)) continue
    seen.add(groups)
    const label = f.label
    out.push({
      id: f.id,
      factor: f,
      stage: f.stage,
      title: (label.startsWith("the ") ? label.slice(4) : label).replace(/^./, (c) => c.toUpperCase()),
      text: `Defects showed up on ${pct(ra)} of hides from runs where ${label} was above ${fmtFactor(f, mid)}, against ${pct(rb)} at or below.`,
      advice: `Try keeping ${label} ${worseAbove ? "at or below" : "above"} ${fmtFactor(f, mid)}.`,
      detail: `${Math.abs(r) >= 0.7 ? "Strong" : "Moderate"} pattern across ${pts.length} runs. It shows what went together, not what caused it.`,
      mid,
      worseAbove,
      rateAbove: ra,
      rateBelow: rb,
      strength: Math.abs(r),
    })
  }
  return out.sort((a, b) => b.strength - a.strength)
}

export interface TypeLink {
  type: string
  factor: Factor
  withType: number
  without: number
  runsWith: number
  text: string
}

/** For each defect type seen in enough runs, the reading that differed most between runs with and without it. */
export function typeLinks(stats: RunDefects[]): TypeLink[] {
  const types = [...new Set(stats.flatMap((s) => Object.keys(s.types)))]
  const out: TypeLink[] = []
  for (const type of types) {
    const withT = stats.filter((s) => s.types[type])
    const without = stats.filter((s) => !s.types[type])
    if (withT.length < 3 || without.length < 3) continue
    let best: TypeLink | null = null
    let bestD = 0.8
    for (const f of FACTORS) {
      const a = withT.map((s) => f.get(s.run)).filter((v): v is number => v !== null)
      const b = without.map((s) => f.get(s.run)).filter((v): v is number => v !== null)
      if (a.length < 3 || b.length < 3) continue
      const spread = Math.sqrt((sd(a) ** 2 + sd(b) ** 2) / 2)
      if (spread === 0) continue
      const d = Math.abs(avg(a) - avg(b)) / spread
      if (d < bestD) continue
      bestD = d
      best = {
        type,
        factor: f,
        withType: avg(a),
        without: avg(b),
        runsWith: withT.length,
        text: `${defectName(type)} showed up in runs where ${f.label} averaged ${fmtFactor(f, avg(a))}, against ${fmtFactor(f, avg(b))} in runs without it.`,
      }
    }
    if (best) out.push(best)
  }
  return out.sort((a, b) => b.runsWith - a.runsWith)
}

export interface CompareRow {
  stage: StageId
  sensor: SensorKey
  label: string
  withDefects: number | null
  clean: number | null
  decimals: number
  unit: string
}

/** Average stage readings in runs that produced a defective hide, next to runs that didn't. */
export function compareRuns(stats: RunDefects[]): { rows: CompareRow[]; withDefects: number; clean: number } {
  const bad = stats.filter((s) => s.defective > 0)
  const clean = stats.filter((s) => s.defective === 0)
  const mean = (g: RunDefects[], f: Factor) => {
    const v = g.map((s) => f.get(s.run)).filter((x): x is number => x !== null)
    return v.length ? avg(v) : null
  }
  const rows = RECIPE.stages.flatMap((st) =>
    (["temp", "ph"] as SensorKey[]).map((m) => {
      const f = sensorFactor(st.id, m)
      const label = f.label.charAt(0).toUpperCase() + f.label.slice(1)
      return { stage: st.id, sensor: m, label, withDefects: mean(bad, f), clean: mean(clean, f), decimals: f.decimals, unit: f.unit }
    }),
  )
  return { rows: rows.filter((r) => r.withDefects !== null || r.clean !== null), withDefects: bad.length, clean: clean.length }
}

export interface LiveAdvice {
  id: string
  tumblerId: number
  text: string
}

/** A running batch whose readings so far sit on the side of a pattern that went with more defects. */
export function liveAdvice(patterns: Pattern[], active: Run[], tumblerName: (id: number) => string): LiveAdvice[] {
  const out: LiveAdvice[] = []
  for (const run of active) {
    for (const p of patterns) {
      const v = p.factor.get(run)
      if (v === null) continue
      const bad = p.worseAbove ? v > p.mid : v <= p.mid
      if (!bad) continue
      out.push({
        id: `${run.id}~${p.id}`,
        tumblerId: run.tumblerId,
        text: `${tumblerName(run.tumblerId)}: ${p.factor.label} is ${fmtFactor(p.factor, v)} so far. Runs ${p.worseAbove ? "above" : "at or below"} ${fmtFactor(p.factor, p.mid)} had defects on ${pct(p.worseAbove ? p.rateAbove : p.rateBelow)} of hides.`,
      })
    }
  }
  return out
}
