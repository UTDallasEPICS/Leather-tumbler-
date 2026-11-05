"use client"
// "How good is it": the model's record on held-back test photos at any sensitivity, and on our own checked photos.
import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { defectName, type Inspection, type VisionStatus } from "@/lib/vision"
import { pct, peopleCheck, testRates } from "@/lib/vision-insights"
import { Slider } from "@/components/ui/slider"
import { Bar, Panel } from "@/components/inspection/shared"

export function ModelQuality({
  status,
  list,
  demo,
  onSave,
}: {
  status: VisionStatus
  list: Inspection[]
  demo: boolean
  onSave: (threshold: number) => Promise<void>
}) {
  const m = status.metrics
  const [draft, setDraft] = useState(status.threshold)
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(status.threshold), [status.threshold])

  const t = draft
  const rates = useMemo(() => (m ? testRates(m, t) : null), [m, t])
  const people = useMemo(() => peopleCheck(list, t), [list, t])
  const changed = Math.abs(draft - status.threshold) > 0.001

  async function save(v: number) {
    setSaving(true)
    try {
      await onSave(v)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title="How good is the model" sub={m ? `${m.model.name} trained on ${m.model.trainImages} photos of good leather (${m.model.trainedOn})` : undefined}>
      {!m || !rates ? (
        <p className="text-sm text-muted-foreground">This model has no test results yet. Run evaluate.py on it to see how it does.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Big
              value={`${rates.caught}/${rates.defects}`}
              label="defects caught"
              sub={`${pct(rates.defects ? rates.caught / rates.defects : 0)} of the defective test photos`}
              tone={rates.caught / Math.max(1, rates.defects) >= 0.9 ? "good" : "warn"}
            />
            <Big
              value={`${rates.falseAlarms}/${rates.good}`}
              label="false alarms"
              sub={`good test photos flagged by mistake`}
              tone={rates.falseAlarms / Math.max(1, rates.good) <= 0.1 ? "good" : "warn"}
            />
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold">Sensitivity</p>
              <p className="text-xs text-muted-foreground tabular-nums">flag at score {t.toFixed(2)}</p>
            </div>
            <Slider
              className="mt-3"
              min={5}
              max={95}
              step={1}
              value={[Math.round((1 - t) * 100)]}
              onValueChange={([v]) => setDraft(Number((1 - v / 100).toFixed(2)))}
              aria-label="Sensitivity"
            />
            <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Fewer false alarms</span>
              <span>Catch more defects</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!changed || saving}
                onClick={() => save(draft)}
                className="rounded-[12px] bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:bg-border disabled:text-muted-foreground"
              >
                {saving ? "Saving…" : demo ? "Use this setting" : "Save on the server"}
              </button>
              {changed && (
                <button type="button" onClick={() => setDraft(status.threshold)} className="rounded-[12px] px-3 py-2 text-sm hover:bg-brown-tint">
                  Undo
                </button>
              )}
              {Math.abs(draft - status.defaultThreshold) > 0.001 && (
                <button type="button" onClick={() => setDraft(status.defaultThreshold)} className="rounded-[12px] px-3 py-2 text-sm text-muted-foreground hover:bg-brown-tint">
                  Model&apos;s own setting ({status.defaultThreshold.toFixed(2)})
                </button>
              )}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-sm font-semibold">By defect type</p>
            <div className="mt-2 space-y-2">
              {rates.perType.map((r) => (
                <div key={r.type} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate">{defectName(r.type)}</span>
                  <Bar value={r.caught} max={r.n} tone={r.caught === r.n ? "green" : "brown"} />
                  <span className="w-12 shrink-0 text-right text-muted-foreground tabular-nums">
                    {r.caught}/{r.n}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-[14px] bg-brown-tint p-3.5">
            <p className="text-sm font-semibold">On {demo ? "the demo" : "your"} photos</p>
            {people.checked === 0 ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                Nobody has said what a photo really shows yet. Answer &quot;What is it really?&quot; on a few and this shows how often the model gets your leather right.
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-muted-foreground">
                People checked {people.checked} photo{people.checked === 1 ? "" : "s"} and the model agreed on {people.agreed} ({pct(people.agreed / people.checked)}).
                {people.defects > 0 && ` It caught ${people.caught} of ${people.defects} real defects`}
                {people.good > 0 && `${people.defects > 0 ? " and" : " It"} flagged ${people.falseAlarms} of ${people.good} good hides by mistake`}.
              </p>
            )}
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Tested on {m.test.images} photos it never trained on ({m.test.good} good, {m.test.defect} defective); the threshold was picked on {m.test.thresholdPickedOn} other
            photos.
            {m.imageAUROC !== null && ` Ranking score (AUROC) ${m.imageAUROC.toFixed(3)}, where 1 means every defect scored above every good photo.`}
            {` About ${Math.round(m.inferenceMs)} ms a photo on the server's CPU.`}
            {m.model.trainedOn.startsWith("MVTec") &&
              " These numbers are for the public MVTec leather photos. Our own leather, camera and lighting differ, so retrain on our photos before trusting it on the line."}
          </p>
        </>
      )}
    </Panel>
  )
}

function Big({ value, label, sub, tone }: { value: string; label: string; sub: string; tone: "good" | "warn" }) {
  return (
    <div className={cn("rounded-[14px] p-3.5", tone === "good" ? "bg-success/10" : "bg-chart-3/20")}>
      <div className="font-display text-[28px] leading-tight font-bold tabular-nums">{value}</div>
      <div className="text-sm font-semibold">{label}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}
