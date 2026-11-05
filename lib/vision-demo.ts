// Demo Mode inspections, so the Inspection page can be tried without the inspection server.
// The photos, heatmaps, scores and test metrics are real output of the model trained on the public MVTec AD
// leather set (vision/evaluate.py copies them into public/vision-demo). Which hide went with which demo run is
// made up: hides from runs with a problem outcome or a cool pickle (lib/run-demo.ts) come out defective more often.
// Edits made in Demo Mode stay in this browser.

import { meanOf, type Run } from "@/lib/runs"
import { seededHistory } from "@/lib/run-demo"
import type { Inspection, InspectStage, VisionMetrics, VisionStatus } from "@/lib/vision"
import metrics from "@/public/vision-demo/metrics.json"
import samples from "@/public/vision-demo/index.json"

export interface DemoSample {
  id: string
  type: string
  score: number
  area: number
}

export const DEMO_SAMPLES = samples as DemoSample[]
export const DEMO_METRICS = metrics as unknown as VisionMetrics
export const demoPhoto = (id: string) => `/vision-demo/${id}.jpg`
export const demoHeatmap = (id: string) => `/vision-demo/${id}-heat.jpg`

const STORAGE_KEY = "vision-demo-v1"
const PHOTOS_PER_RUN = 3
const DEMO_TUMBLERS = [3, 5]

interface DemoEdits {
  threshold?: number
  labels: Record<string, string | null>
  added: Inspection[]
  removed: string[]
}

function rng(seed: number) {
  let s = seed % 2147483647 || 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

function fromSample(s: DemoSample, id: string, at: number, meta: { tumblerId: number | null; runId: string | null; stage: InspectStage | null }, label: string | null): Inspection {
  return { id, createdAt: at, ...meta, score: s.score, defectArea: s.area, label, note: "", imageUrl: demoPhoto(s.id), heatmapUrl: demoHeatmap(s.id), demo: true }
}

function seeded(): Inspection[] {
  const out: Inspection[] = []
  for (const tid of DEMO_TUMBLERS) {
    const runs = seededHistory(tid).filter((r) => r.status === "completed")
    runs.forEach((run: Run, n) => {
      const rand = rng(hash(run.id))
      const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
      const q = run.outcome?.quality
      // In lib/run-demo.ts a cool pickle leaves the pickle pH high, and that (or a long liming) is what gives a
      // run "issues". Here an under-acid pickle shows up as uneven color; other problem runs as marks.
      const pickleTemp = meanOf(run.sensors.pickling?.temp) ?? 30
      const underPickled = pickleTemp < 28.5
      const bad =
        q === "poor" ? 3 : q === "issues" ? 1 + (rand() < 0.6 ? 1 : 0) : underPickled && rand() < 0.5 ? 1 : rand() < 0.1 ? 1 : 0
      // the two newest runs on each tumbler haven't been checked by a person yet
      const checked = n < runs.length - 2
      for (let i = 0; i < PHOTOS_PER_RUN; i++) {
        const type = i >= bad ? "good" : underPickled ? pick(["color", "color", "glue"]) : pick(["fold", "poke", "cut"])
        const pool = DEMO_SAMPLES.filter((s) => s.type === type)
        if (!pool.length) continue
        const at = (run.endedAt ?? run.startedAt) + (i + 1) * 4 * 60_000
        out.push(fromSample(pick(pool), `demo-${run.id}-${i}`, at, { tumblerId: tid, runId: run.id, stage: "finish" }, checked ? type : null))
      }
    })
  }
  return out
}

let seedCache: Inspection[] | null = null

function readEdits(): DemoEdits {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { labels: {}, added: [], removed: [], ...JSON.parse(raw) }
  } catch {}
  return { labels: {}, added: [], removed: [] }
}
const writeEdits = (e: DemoEdits) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(e))
  } catch {}
}

export function demoState(): { status: VisionStatus; list: Inspection[] } {
  seedCache ??= seeded()
  const e = readEdits()
  const removed = new Set(e.removed)
  const list = [...e.added, ...seedCache]
    .filter((i) => !removed.has(String(i.id)))
    .map((i) => (String(i.id) in e.labels ? { ...i, label: e.labels[String(i.id)] } : i))
    .sort((a, b) => b.createdAt - a.createdAt)
  const threshold = e.threshold ?? DEMO_METRICS.defaultThreshold
  return {
    list,
    status: {
      ready: true,
      error: null,
      threshold,
      defaultThreshold: DEMO_METRICS.defaultThreshold,
      metrics: DEMO_METRICS,
      counts: { total: list.length, flagged: list.filter((i) => i.score >= threshold).length, labelled: list.filter((i) => i.label).length },
    },
  }
}

export function demoInspect(sampleId: string, meta: { tumblerId: number | null; runId: string | null; stage: InspectStage | null }): Inspection {
  const s = DEMO_SAMPLES.find((x) => x.id === sampleId)
  if (!s) throw new Error("Unknown demo photo")
  const e = readEdits()
  const insp = fromSample(s, `demo-new-${Date.now().toString(36)}`, Date.now(), meta, null)
  writeEdits({ ...e, added: [insp, ...e.added] })
  return insp
}

export function demoLabel(id: Inspection["id"], label: string | null) {
  const e = readEdits()
  writeEdits({ ...e, labels: { ...e.labels, [String(id)]: label } })
}

export function demoRemove(id: Inspection["id"]) {
  const e = readEdits()
  writeEdits({ ...e, removed: [...e.removed, String(id)], added: e.added.filter((i) => i.id !== id) })
}

export function demoSetThreshold(threshold: number) {
  writeEdits({ ...readEdits(), threshold })
}

/** Back to the made-up history as shipped. */
export function demoReset() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
