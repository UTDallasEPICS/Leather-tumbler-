"use client"
// "Check a hide": take or pick a photo, tie it to a tumbler, run and stage, see the model's answer, say what it really is.
import { useEffect, useMemo, useRef, useState } from "react"
import { Camera, Loader2, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { RECIPE } from "@/lib/recipe"
import { fmtWhen, phaseOf, useRuns, type Run } from "@/lib/runs"
import { useTumblers } from "@/lib/tumblers"
import type { useVision } from "@/lib/use-vision"
import { DEMO_SAMPLES, demoPhoto } from "@/lib/vision-demo"
import { STAGE_NAMES, defectName, type InspectStage, type Inspection } from "@/lib/vision"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LabelPicker, Panel, PhotoToggle, ScoreBar, Verdict } from "@/components/inspection/shared"

type Vision = ReturnType<typeof useVision>

const NO_RUN = "none"
const stageOfRun = (run: Run | undefined): InspectStage => {
  if (!run || run.status !== "active") return "finish"
  const p = phaseOf(run)
  return p.kind === "finish" ? "finish" : p.stage.id
}

export function CheckHide({ vision, threshold }: { vision: Vision; threshold: number }) {
  const { tumblers } = useTumblers()
  const { activeRun, history } = useRuns()
  const [tumblerId, setTumblerId] = useState<number | null>(null)
  // "" until a batch has been picked for the current tumbler
  const [runId, setRunId] = useState<string>("")
  const [stage, setStage] = useState<InspectStage>("finish")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Inspection | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // start on a tumbler that has a run going, else the first one
  useEffect(() => {
    if (tumblerId !== null || !tumblers.length) return
    setTumblerId((tumblers.find((t) => activeRun(t.id)) ?? tumblers[0]).id)
  }, [tumblers, tumblerId, activeRun])

  const runs = useMemo(() => {
    if (tumblerId === null) return []
    const a = activeRun(tumblerId)
    return [...(a ? [a] : []), ...history(tumblerId).filter((r) => r.status === "completed").slice(0, 6)]
  }, [tumblerId, activeRun, history])

  // Pick the running batch, else the last finished one, when there is no choice yet or the chosen run has
  // gone (e.g. it was overridden). Runs update as the controller syncs, which must not undo a choice.
  useEffect(() => {
    if (runId === NO_RUN || runs.some((r) => r.id === runId)) return
    const r = runs[0]
    setRunId(r?.id ?? NO_RUN)
    setStage(stageOfRun(r))
  }, [runs, runId])

  const run = runs.find((r) => r.id === runId)
  const meta = { tumblerId, runId: run?.id ?? null, stage }

  async function go(photo: File | string) {
    setBusy(true)
    setError(null)
    try {
      setResult(await vision.inspect(photo, meta))
    } catch (e) {
      setError(e instanceof Error ? e.message : "The inspection server didn't answer")
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function pickLabel(l: string | null) {
    if (!result) return
    setResult({ ...result, label: l })
    try {
      await vision.label(result.id, l)
    } catch {
      setError("Couldn't save that answer on the inspection server")
    }
  }

  const runName = (r: Run) => (r.status === "active" ? `Run ${r.number} · running now` : `Run ${r.number} · finished ${fmtWhen(r.endedAt ?? r.startedAt)}`)

  return (
    <Panel title="Check a hide" sub="Photograph the grain side flat, filling the frame, under the same light every time.">
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Tumbler">
          <Select
            value={tumblerId === null ? "" : String(tumblerId)}
            onValueChange={(v) => {
              setTumblerId(Number(v))
              setRunId("")
            }}
          >
            <SelectTrigger className="w-full" aria-label="Tumbler">
              <SelectValue placeholder="Tumbler" />
            </SelectTrigger>
            <SelectContent>
              {tumblers.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Batch">
          <Select
            value={runId}
            onValueChange={(v) => {
              setRunId(v)
              setStage(stageOfRun(runs.find((r) => r.id === v)))
            }}
          >
            <SelectTrigger className="w-full" aria-label="Batch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {runs.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {runName(r)}
                </SelectItem>
              ))}
              <SelectItem value={NO_RUN}>Not part of a run</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Taken at">
          <Select value={stage} onValueChange={(v) => setStage(v as InspectStage)}>
            <SelectTrigger className="w-full" aria-label="Taken at">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...RECIPE.stages.map((s) => s.id), "finish" as const].map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_NAMES[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {vision.demo ? (
        <div className="mt-4">
          <p className="text-sm font-semibold">Pick a demo photo</p>
          <p className="text-xs text-muted-foreground">Real held-back test photos from the MVTec AD leather set. The caption is what each one really shows.</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
            {DEMO_SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => go(s.id)}
                className="w-[76px] shrink-0 rounded-[10px] border-[1.5px] border-border p-1 text-left hover:border-brown disabled:opacity-60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={demoPhoto(s.id)} alt={`${defectName(s.type)} sample`} className="aspect-square w-full rounded-[7px] object-cover" />
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{defectName(s.type)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) go(f)
            }}
          />
          <button
            type="button"
            disabled={busy || vision.connection !== "ready" || !vision.status?.ready}
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-primary px-4 py-4 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-border disabled:text-muted-foreground"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
            {busy ? "Checking…" : "Take or choose a photo"}
          </button>
          {vision.status && !vision.status.ready && <p className="mt-2 text-sm text-primary">The server is up but has no model loaded: {vision.status.error}</p>}
        </div>
      )}

      {error && <p className="mt-3 rounded-[12px] bg-red-tint px-3 py-2 text-sm text-primary">{error}</p>}

      {result && (
        <div className="@container mt-5 border-t border-border pt-5">
        <div className="grid gap-4 @lg:grid-cols-[minmax(0,240px)_1fr]">
          <PhotoToggle insp={result} className="mx-auto w-full max-w-[320px]" />
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Verdict insp={result} threshold={threshold} className="text-sm" />
              <button
                type="button"
                onClick={() => setResult(null)}
                className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-brown-tint")}
              >
                <RotateCcw className="size-3.5" />
                Next hide
              </button>
            </div>
            <div className="mt-3">
              <ScoreBar score={result.score} threshold={threshold} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {result.defectArea > 0.0005
                ? `The outlined area covers ${(result.defectArea * 100).toFixed(1)}% of the photo.`
                : "No part of the photo stands out from good leather."}
            </p>
            <p className="mt-4 text-sm font-semibold">What is it really?</p>
            <p className="mb-2 text-xs text-muted-foreground">Your answer is what the defect counts and process patterns use, and it shows how often the model is right on your leather.</p>
            <LabelPicker value={result.label} onPick={pickLabel} />
          </div>
        </div>
        </div>
      )}
    </Panel>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
