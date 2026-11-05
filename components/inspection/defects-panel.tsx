"use client"
// "What's showing up": defects by type, and the share of defective hides run by run.
import { useMemo } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { defectName, type Inspection } from "@/lib/vision"
import { defectBreakdown, pct, type RunDefects } from "@/lib/vision-insights"
import { Bar, Panel } from "@/components/inspection/shared"

export function DefectsPanel({
  list,
  threshold,
  stats,
  tumblerName,
}: {
  list: Inspection[]
  threshold: number
  stats: RunDefects[]
  tumblerName: (id: number) => string
}) {
  const b = useMemo(() => defectBreakdown(list, threshold), [list, threshold])
  const top = Math.max(1, ...b.byType.map((t) => t.count), b.unchecked)
  const recent = stats.slice(-14)

  return (
    <Panel
      title="What's showing up"
      sub={b.total ? `${b.defective} of ${b.total} photos defective (${pct(b.defective / b.total)})` : "No photos checked yet"}
    >
      {b.defective === 0 ? (
        <p className="text-sm text-muted-foreground">{b.total ? "No defects so far." : "Check a hide to start the count."}</p>
      ) : (
        <div className="space-y-2">
          {b.byType.map((t) => (
            <div key={t.type} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 truncate">{defectName(t.type)}</span>
              <Bar value={t.count} max={top} tone="red" />
              <span className="w-8 shrink-0 text-right tabular-nums">{t.count}</span>
            </div>
          ))}
          {b.unchecked > 0 && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="w-32 shrink-0 truncate">Flagged, not checked</span>
              <Bar value={b.unchecked} max={top} />
              <span className="w-8 shrink-0 text-right tabular-nums">{b.unchecked}</span>
            </div>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold">Defective hides, run by run</p>
          <div className="mt-3 flex h-32 items-end gap-1.5" role="list">
            {recent.map((s) => (
              <Link
                key={s.run.id}
                href={`/tumbler?id=${s.run.tumblerId}`}
                role="listitem"
                title={`${tumblerName(s.run.tumblerId)} run ${s.run.number}: ${s.defective} of ${s.photos} defective`}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <span className="text-[10px] text-muted-foreground tabular-nums">{s.defective}/{s.photos}</span>
                <span
                  className={cn("w-full rounded-t-[6px] group-hover:opacity-80", s.rate >= 0.5 ? "bg-primary" : s.rate > 0 ? "bg-tan" : "bg-success/60")}
                  style={{ height: `${Math.max(6, s.rate * 100)}%` }}
                />
                <span className="mt-1 w-full truncate text-center text-[10px] text-muted-foreground">
                  T{s.run.tumblerId}·{s.run.number}
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Last {recent.length} runs with photos, oldest on the left. T3·4 is Tumbler 3, run 4.</p>
        </div>
      )}
    </Panel>
  )
}
