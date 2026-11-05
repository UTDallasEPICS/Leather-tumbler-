"use client"
// Small pieces the Inspection panels share.
import { useState } from "react"
import { CircleCheck, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { DEFECT_TYPES, defectName, flagged, type Inspection } from "@/lib/vision"

export const card = "rounded-[18px] border-[1.5px] border-border"

export function Panel({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn(card, "min-w-0 p-4 sm:p-5", className)}>
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Verdict({ insp, threshold, className }: { insp: Inspection; threshold: number; className?: string }) {
  const bad = flagged(insp, threshold)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
        bad ? "bg-red-tint text-primary" : "bg-success/15 text-success",
        className,
      )}
    >
      {bad ? <TriangleAlert className="size-3.5" /> : <CircleCheck className="size-3.5" />}
      {bad ? "Possible defect" : "Looks good"}
    </span>
  )
}

export function LabelChip({ label }: { label: string | null }) {
  if (!label) return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Not checked</span>
  const good = label === "good"
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", good ? "bg-success/15 text-success" : "bg-chart-3/25 text-brown-dark")}>
      {good ? "Checked: good" : defectName(label)}
    </span>
  )
}

/** The score on a 0–1 track with the flag threshold marked. */
export function ScoreBar({ score, threshold }: { score: number; threshold: number }) {
  const bad = score >= threshold
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">Anomaly score</span>
        <span className={cn("font-display text-lg font-bold tabular-nums", bad ? "text-primary" : "text-success")}>{score.toFixed(2)}</span>
      </div>
      <div className="relative mt-1 h-2.5 rounded-full bg-muted">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", bad ? "bg-primary" : "bg-success")}
          style={{ width: `${Math.min(100, Math.max(2, score * 100))}%` }}
        />
        <div className="absolute -top-1 h-[18px] w-0.5 rounded bg-foreground" style={{ left: `${threshold * 100}%` }} title="Flag threshold" />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">Flagged at {threshold.toFixed(2)} and above</div>
    </div>
  )
}

/** "What is it really?": good, or one of the defect types. */
export function LabelPicker({ value, onPick, busy }: { value: string | null; onPick: (label: string | null) => void; busy?: boolean }) {
  const chip = (id: string, text: string, tone: "good" | "bad") => {
    const on = value === id
    return (
      <button
        key={id}
        type="button"
        disabled={busy}
        aria-pressed={on}
        onClick={() => onPick(on ? null : id)}
        className={cn(
          "rounded-full border-[1.5px] px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
          on
            ? tone === "good"
              ? "border-success bg-success text-white"
              : "border-brown bg-brown text-white"
            : "border-border hover:bg-brown-tint",
        )}
      >
        {text}
      </button>
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {chip("good", "Good leather", "good")}
      {DEFECT_TYPES.map((t) => chip(t.id, t.name, "bad"))}
    </div>
  )
}

/** Photo with a Photo / Heatmap switch. */
export function PhotoToggle({ insp, className, startOn = "heat" }: { insp: Inspection; className?: string; startOn?: "photo" | "heat" }) {
  const [view, setView] = useState<"photo" | "heat">(startOn)
  return (
    <div className={cn("relative overflow-hidden rounded-[14px] bg-muted", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- served by the inspection server, not part of the build */}
      <img src={view === "heat" ? insp.heatmapUrl : insp.imageUrl} alt={view === "heat" ? "Heatmap of where the model sees a defect" : "Leather photo"} className="aspect-square w-full object-cover" />
      <div className="absolute top-2 left-2 flex rounded-full bg-black/55 p-0.5 text-xs font-semibold text-white backdrop-blur">
        {(["photo", "heat"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={cn("rounded-full px-2.5 py-1", view === v && "bg-white text-black")}
          >
            {v === "photo" ? "Photo" : "Heatmap"}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Bar({ value, max, tone = "brown" }: { value: number; max: number; tone?: "brown" | "red" | "green" }) {
  return (
    <div className="h-2 flex-1 rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", tone === "red" ? "bg-primary" : tone === "green" ? "bg-success" : "bg-brown")}
        style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
      />
    </div>
  )
}
