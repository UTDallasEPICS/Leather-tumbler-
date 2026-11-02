// Numbers for the Analytics screen, worked out from the reading log the dashboard keeps (newest first, up to 100).
// "Warning" uses the same levels as the alarms; "stop" uses the limits set under Configure that trip the kill switch.

import {
  OVERHEAT_WARNING_TEMP,
  PH_WARNING_HIGH,
  PH_WARNING_LOW,
  type Config,
  type LogEntry,
  type NotificationLog,
} from "@/lib/dashboard-context"

export type Level = "ok" | "warn" | "stop"

/** One reading at time t (ms). */
export interface Point {
  t: number
  v: number
}

export interface Stats {
  latest: number
  min: number
  max: number
  avg: number
  /** change per minute over the last few minutes; null with too little to go on */
  perMin: number | null
}

export interface Insight {
  level: Level
  title: string
  detail: string
}

const RANK: Record<Level, number> = { ok: 0, warn: 1, stop: 2 }
export const worst = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b)

export const tempLevel = (v: number, c: Config): Level =>
  v >= c.heatLimit ? "stop" : v >= OVERHEAT_WARNING_TEMP ? "warn" : "ok"

export const phLevel = (v: number, c: Config): Level =>
  v < c.phLowLimit || v > c.phHighLimit ? "stop" : v < PH_WARNING_LOW || v > PH_WARNING_HIGH ? "warn" : "ok"

export const readingLevel = (l: LogEntry, c: Config): Level => worst(tempLevel(l.temperature, c), phLevel(l.ph, c))

/** Oldest-first series for one reading. History rows that only carried pH come back with temperature 0; those are skipped. */
export function seriesOf(logs: LogEntry[], key: "temperature" | "ph"): Point[] {
  return logs
    .filter((l) => key !== "temperature" || l.temperature > 0)
    .map((l) => ({ t: l.timestamp.getTime(), v: l[key] }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t)
}

const TREND_WINDOW_MS = 5 * 60_000

/** Least-squares slope over the last five minutes of readings, per minute. */
function trendPerMinute(points: Point[]): number | null {
  if (!points.length) return null
  const end = points[points.length - 1].t
  const recent = points.filter((p) => p.t >= end - TREND_WINDOW_MS)
  if (recent.length < 3) return null
  const xs = recent.map((p) => (p.t - recent[0].t) / 60_000)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = recent.reduce((a, p) => a + p.v, 0) / recent.length
  let num = 0
  let den = 0
  recent.forEach((p, i) => {
    num += (xs[i] - mx) * (p.v - my)
    den += (xs[i] - mx) ** 2
  })
  return den > 0 ? num / den : null
}

export function statsOf(points: Point[]): Stats | null {
  if (!points.length) return null
  const vs = points.map((p) => p.v)
  return {
    latest: vs[vs.length - 1],
    min: Math.min(...vs),
    max: Math.max(...vs),
    avg: vs.reduce((a, b) => a + b, 0) / vs.length,
    perMin: trendPerMinute(points),
  }
}

/** Minutes until `value` reaches `target` at `perMin`, or null if it isn't heading that way. */
function minutesTo(value: number, target: number, perMin: number | null): number | null {
  if (!perMin) return null
  const m = (target - value) / perMin
  return m > 0 ? m : null
}

// a projection this close turns an in-range reading into a heads-up
const SOON_MIN = 15

const inAbout = (m: number) => (m < 1 ? "in under a minute" : m < 90 ? `in about ${Math.round(m)} min` : `in about ${(m / 60).toFixed(1)} h`)

export function fmtSpan(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 90) return `${s} s`
  const m = Math.round(s / 60)
  return m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`
}

export function tempInsight(points: Point[], c: Config, live: boolean): Insight | null {
  const s = statsOf(points)
  if (!s) return null
  const now = `${s.latest.toFixed(1)}°C`

  if (!live) {
    const over = points.filter((p) => p.v >= OVERHEAT_WARNING_TEMP).length
    return {
      level: tempLevel(s.max, c),
      title: "Temperature · last run",
      detail: `Ended at ${now}, peaked at ${s.max.toFixed(1)}°C. ${
        over ? `${over} reading${over > 1 ? "s" : ""} at or over ${OVERHEAT_WARNING_TEMP}°C.` : `Stayed under ${OVERHEAT_WARNING_TEMP}°C.`
      }`,
    }
  }

  const rate = s.perMin !== null && Math.abs(s.perMin) >= 0.05 ? s.perMin : null
  const moving = rate === null ? "holding steady" : `${rate > 0 ? "rising" : "falling"} ${Math.abs(rate).toFixed(1)}°C/min`
  const level = tempLevel(s.latest, c)

  if (level === "stop") {
    return { level, title: "Temperature at the stop limit", detail: `${now}, at or over the ${c.heatLimit}°C limit.` }
  }
  if (level === "warn") {
    const toStop = minutesTo(s.latest, c.heatLimit, rate)
    return {
      level,
      title: "Temperature over the warning level",
      detail: `${now}, ${moving}.${toStop ? ` Reaches the ${c.heatLimit}°C stop limit ${inAbout(toStop)}.` : ""}`,
    }
  }
  const toWarn = minutesTo(s.latest, OVERHEAT_WARNING_TEMP, rate)
  if (toWarn !== null && toWarn <= SOON_MIN) {
    return {
      level: "warn",
      title: "Temperature climbing",
      detail: `${now}, ${moving}. Reaches the ${OVERHEAT_WARNING_TEMP}°C warning ${inAbout(toWarn)}.`,
    }
  }
  return { level: "ok", title: "Temperature in range", detail: `${now}, ${moving}.` }
}

export function phInsight(points: Point[], c: Config, live: boolean): Insight | null {
  const s = statsOf(points)
  if (!s) return null
  const now = `pH ${s.latest.toFixed(2)}`
  const safe = `${PH_WARNING_LOW}–${PH_WARNING_HIGH}`

  if (!live) {
    const out = points.filter((p) => p.v < PH_WARNING_LOW || p.v > PH_WARNING_HIGH).length
    return {
      level: worst(phLevel(s.min, c), phLevel(s.max, c)),
      title: "pH · last run",
      detail: `Ended at ${now}, ranged ${s.min.toFixed(2)}–${s.max.toFixed(2)}. ${
        out ? `${out} reading${out > 1 ? "s" : ""} outside ${safe}.` : `Stayed inside ${safe}.`
      }`,
    }
  }

  const rate = s.perMin !== null && Math.abs(s.perMin) >= 0.01 ? s.perMin : null
  const moving = rate === null ? "holding steady" : `${rate > 0 ? "rising" : "falling"} ${Math.abs(rate).toFixed(2)}/min`
  const level = phLevel(s.latest, c)

  if (level === "stop") {
    return { level, title: "pH past a stop limit", detail: `${now}, outside the ${c.phLowLimit}–${c.phHighLimit} stop limits.` }
  }
  if (level === "warn") {
    const stopAt = s.latest > PH_WARNING_HIGH ? c.phHighLimit : c.phLowLimit
    const toStop = minutesTo(s.latest, stopAt, rate)
    return {
      level,
      title: "pH outside the safe range",
      detail: `${now}, ${moving}. Safe range is ${safe}.${toStop ? ` Reaches the ${stopAt} stop limit ${inAbout(toStop)}.` : ""}`,
    }
  }
  const edge = rate !== null && rate > 0 ? PH_WARNING_HIGH : PH_WARNING_LOW
  const toEdge = minutesTo(s.latest, edge, rate)
  if (toEdge !== null && toEdge <= SOON_MIN) {
    return { level: "warn", title: "pH drifting", detail: `${now}, ${moving}. Leaves the safe range (${edge}) ${inAbout(toEdge)}.` }
  }
  return { level: "ok", title: "pH in range", detail: `${now}, ${moving}. Safe range is ${safe}.` }
}

export function eventLevel(e: NotificationLog): Level {
  const s = `${e.title} ${e.body}`.toLowerCase()
  if (s.includes("emergency")) return "stop"
  if (/warning|too low|too high/.test(s)) return "warn"
  return "ok"
}

export function readingsCsv(logs: LogEntry[], c: Config): string {
  const rows = logs
    .filter((l) => Number.isFinite(l.timestamp.getTime()))
    .reverse()
    .map((l) => [l.timestamp.toISOString(), l.temperature.toFixed(2), l.ph.toFixed(2), readingLevel(l, c)].join(","))
  return ["time,temperature_c,ph,status", ...rows].join("\n")
}
