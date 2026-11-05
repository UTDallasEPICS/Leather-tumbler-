"use client"
// Recent photos, and a detail view to say what each one really shows or delete it.
import { useState } from "react"
import { Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtWhen } from "@/lib/runs"
import { STAGE_NAMES, flagged, type Inspection } from "@/lib/vision"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LabelChip, LabelPicker, Panel, PhotoToggle, ScoreBar, Verdict } from "@/components/inspection/shared"

type Filter = "all" | "flagged" | "unchecked"

export function PhotoGrid({
  list,
  threshold,
  runName,
  onLabel,
  onRemove,
}: {
  list: Inspection[]
  threshold: number
  runName: (i: Inspection) => string
  onLabel: (id: Inspection["id"], label: string | null) => Promise<void>
  onRemove: (id: Inspection["id"]) => Promise<void>
}) {
  const [filter, setFilter] = useState<Filter>("all")
  const [openId, setOpenId] = useState<Inspection["id"] | null>(null)
  const [limit, setLimit] = useState(24)
  const open = list.find((i) => i.id === openId) ?? null

  const shown = list.filter((i) => (filter === "flagged" ? flagged(i, threshold) : filter === "unchecked" ? !i.label : true))
  const counts = { all: list.length, flagged: list.filter((i) => flagged(i, threshold)).length, unchecked: list.filter((i) => !i.label).length }

  return (
    <Panel title="Photos" sub="Newest first. Open one to say what it really shows.">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["all", "All"],
            ["flagged", "Flagged"],
            ["unchecked", "Not checked"],
          ] as [Filter, string][]
        ).map(([f, text]) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn("rounded-full px-3 py-1.5 text-sm font-medium", filter === f ? "bg-brown text-white" : "bg-brown-tint hover:bg-brown-tint/70")}
          >
            {text} <span className="tabular-nums opacity-80">{counts[f]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {shown.slice(0, limit).map((i) => (
            <button key={i.id} type="button" onClick={() => setOpenId(i.id)} className="group text-left">
              <div className="relative overflow-hidden rounded-[12px] bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.heatmapUrl} alt="" loading="lazy" className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
                <span
                  className={cn(
                    "absolute right-1 bottom-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white",
                    flagged(i, threshold) ? "bg-primary" : "bg-success",
                  )}
                >
                  {i.score.toFixed(2)}
                </span>
              </div>
              <div className="mt-1 truncate">
                <LabelChip label={i.label} />
              </div>
            </button>
          ))}
        </div>
      )}
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + 24)} className="mt-3 w-full rounded-[12px] py-2 text-sm font-semibold text-brown hover:bg-brown-tint">
          Show more ({shown.length - limit})
        </button>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        {open && (
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{runName(open)}</DialogTitle>
              <DialogDescription>
                {fmtWhen(open.createdAt)}
                {open.stage && ` · ${STAGE_NAMES[open.stage]}`}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,260px)_1fr]">
              <PhotoToggle key={String(open.id)} insp={open} />
              <div className="min-w-0">
                <Verdict insp={open} threshold={threshold} className="text-sm" />
                <div className="mt-3">
                  <ScoreBar score={open.score} threshold={threshold} />
                </div>
                <p className="mt-4 text-sm font-semibold">What is it really?</p>
                <div className="mt-2">
                  <LabelPicker value={open.label} onPick={(l) => onLabel(open.id, l)} />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await onRemove(open.id)
                    setOpenId(null)
                  }}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-red-tint hover:text-primary"
                >
                  <Trash2 className="size-4" />
                  Delete this photo
                </button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Panel>
  )
}
