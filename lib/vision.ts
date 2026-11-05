// Leather inspection: talks to the inspection server (vision/service.py) that runs the defect model.
// The model learned what good leather looks like and scores each photo by how far it is from that; the
// person then says what the defect actually was, which is what the defect and process views count.

import type { StageId } from "@/lib/recipe"
import { getVisionOrigin } from "@/lib/settings"

/** Where in the process the photo was taken; "finish" is the leather out of the drum. */
export type InspectStage = StageId | "finish"

export interface VisionMetrics {
  model: {
    name: string
    backbone: string | null
    trainedOn: string
    trainImages: number
    imageSize: [number, number] | null
    fitSeconds: number | null
    trainedAt: string
  }
  defaultThreshold: number
  test: { images: number; good: number; defect: number; thresholdPickedOn: number }
  imageAUROC: number | null
  pixelAUROC: number | null
  inferenceMs: number
  /** every held-back test photo: its true type ("good" or a defect) and the model's score */
  scores: { type: string; score: number }[]
}

export interface VisionStatus {
  ready: boolean
  error: string | null
  /** photos scoring at or above this are flagged */
  threshold: number
  defaultThreshold: number
  metrics: VisionMetrics | null
  counts: { total: number; flagged: number; labelled: number }
}

export interface Inspection {
  id: number | string
  createdAt: number
  tumblerId: number | null
  runId: string | null
  stage: InspectStage | null
  /** 0–1; 0.5 is the threshold the model picked for itself */
  score: number
  /** share of the photo the model marks as defective */
  defectArea: number
  /** what a person said it was: "good", a defect type id, or null if nobody has checked it */
  label: string | null
  note: string
  imageUrl: string
  heatmapUrl: string
  demo?: boolean
}

export interface DefectType {
  id: string
  name: string
  hint: string
}

// The first five are the MVTec AD leather categories the demo model was tested on.
export const DEFECT_TYPES: DefectType[] = [
  { id: "color", name: "Uneven color", hint: "Patches lighter or darker than the rest" },
  { id: "fold", name: "Fold / crease", hint: "A line pressed into the grain" },
  { id: "cut", name: "Cut / tear", hint: "The surface is cut through" },
  { id: "poke", name: "Hole / poke", hint: "Pinholes or punctures" },
  { id: "glue", name: "Stain / residue", hint: "Something dried on the surface" },
  { id: "grain", name: "Grain damage", hint: "Cracked, loose or rubbed grain" },
  { id: "mould", name: "Mould", hint: "Spots of growth" },
  { id: "other", name: "Other", hint: "Anything else" },
]

const TYPE_NAMES = new Map(DEFECT_TYPES.map((t) => [t.id, t.name]))
export const defectName = (id: string) => (id === "good" ? "Good" : (TYPE_NAMES.get(id) ?? id.charAt(0).toUpperCase() + id.slice(1)))

export const STAGE_NAMES: Record<InspectStage, string> = {
  soaking: "Soaking",
  liming: "Liming",
  deliming: "Deliming",
  pickling: "Pickling",
  tanning: "Tanning",
  finish: "Finished leather",
}

/** A person's answer wins over the model's guess. */
export const isDefect = (i: Inspection, threshold: number) => (i.label ? i.label !== "good" : i.score >= threshold)
export const flagged = (i: Inspection, threshold: number) => i.score >= threshold

// ---- server API --------------------------------------------------------------------------------------

const base = () => `${getVisionOrigin()}/api/vision`

async function call<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 10_000, ...rest } = init
  const res = await fetch(`${base()}${path}`, { ...rest, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      const body = await res.json()
      if (typeof body.detail === "string") detail = body.detail
    } catch {}
    throw new Error(detail)
  }
  return (await res.json()) as T
}

const absolute = (i: Inspection): Inspection => ({
  ...i,
  imageUrl: `${getVisionOrigin()}${i.imageUrl}`,
  heatmapUrl: `${getVisionOrigin()}${i.heatmapUrl}`,
})

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })

export const visionApi = {
  status: () => call<VisionStatus>("/status", { timeoutMs: 5_000 }),
  inspections: async (limit = 500) => (await call<Inspection[]>(`/inspections?limit=${limit}`)).map(absolute),
  setThreshold: (threshold: number) => call<VisionStatus>("/settings", { method: "PUT", ...json({ threshold }) }),
  inspect: async (photo: Blob, meta: { tumblerId?: number | null; runId?: string | null; stage?: InspectStage | null }) => {
    const form = new FormData()
    form.append("photo", photo, "photo.jpg")
    if (meta.tumblerId != null) form.append("tumblerId", String(meta.tumblerId))
    if (meta.runId) form.append("runId", meta.runId)
    if (meta.stage) form.append("stage", meta.stage)
    // the first photo after the server starts also warms the model up
    return absolute(await call<Inspection>("/inspect", { method: "POST", body: form, timeoutMs: 60_000 }))
  },
  update: async (id: Inspection["id"], patch: Partial<Pick<Inspection, "label" | "runId" | "tumblerId" | "stage" | "note">>) =>
    absolute(await call<Inspection>(`/inspections/${id}`, { method: "PATCH", ...json(patch) })),
  remove: (id: Inspection["id"]) => call<{ success: boolean }>(`/inspections/${id}`, { method: "DELETE" }),
}

/** Phone photos are 3–12 MB; the model looks at 256 px, so send a 1600 px JPEG instead. */
export async function shrinkPhoto(file: File, maxSide = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" })
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject()), "image/jpeg", 0.9))
  } catch {
    return file
  }
}
