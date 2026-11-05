"use client"
// "What to change": process readings that went with more defective hides, readings to watch on batches running
// now, and stage-by-stage averages for runs with and without defects.
import { useMemo } from "react"
import { Lightbulb, Radio } from "lucide-react"
import { cn } from "@/lib/utils"
import { RECIPE } from "@/lib/recipe"
import type { Run } from "@/lib/runs"
import { MIN_RUNS, compareRuns, liveAdvice, processPatterns, typeLinks, type RunDefects } from "@/lib/vision-insights"
import { Panel } from "@/components/inspection/shared"

const stageLabel = (id: string) => (id === "start" ? "Batch" : (RECIPE.stages.find((s) => s.id === id)?.name ?? id))

export function ProcessPanel({ stats, active, tumblerName }: { stats: RunDefects[]; active: Run[]; tumblerName: (id: number) => string }) {
  const patterns = useMemo(() => processPatterns(stats), [stats])
  const links = useMemo(() => typeLinks(stats), [stats])
  const compare = useMemo(() => compareRuns(stats), [stats])
  const live = useMemo(() => liveAdvice(patterns, active, tumblerName), [patterns, active, tumblerName])

  return (
    <Panel
      title="What to change in the process"
      sub="Each run's temperature, pH and drum speed, set against how its hides came out."
    >
      {stats.length < MIN_RUNS ? (
        <p className="text-sm text-muted-foreground">
          Patterns show once {MIN_RUNS} finished runs have photos of their leather. So far: {stats.length}. Photograph a few hides from every batch as it comes out, and
          link them to the run.
        </p>
      ) : (
        <>
          {live.length > 0 && (
            <div className="mb-4 space-y-2">
              {live.map((a) => (
                <div key={a.id} className="flex gap-3 rounded-[14px] bg-chart-3/20 p-3.5">
                  <Radio className="mt-0.5 size-5 shrink-0 text-brown" />
                  <div>
                    <p className="text-sm font-semibold">Running now</p>
                    <p className="text-sm text-muted-foreground">{a.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {patterns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No clear pattern across {stats.length} runs yet: defects came out about the same whatever the readings were.
            </p>
          ) : (
            <div className="space-y-2.5">
              {patterns.slice(0, 5).map((p) => (
                <div key={p.id} className="flex gap-3 rounded-[14px] border-[1.5px] border-border p-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brown-tint">
                    <Lightbulb className="size-[18px] text-brown" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{p.title}</p>
                      <span className="rounded-md bg-brown-tint px-1.5 py-0.5 text-[11px] font-semibold text-brown-dark">{stageLabel(p.stage)}</span>
                    </div>
                    <p className="mt-0.5 text-sm">{p.text}</p>
                    <p className="mt-1 text-sm font-semibold text-brown-dark">{p.advice}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{p.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {links.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold">By defect type</p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {links.map((l) => (
                  <li key={l.type} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    <span>
                      {l.text} <span className="text-xs">({l.runsWith} runs)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {compare.withDefects > 0 && compare.clean > 0 && (
            <div className="mt-5 overflow-x-auto">
              <p className="text-sm font-semibold">Average readings, stage by stage</p>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-2 font-semibold">Reading</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Runs with defects ({compare.withDefects})</th>
                    <th className="py-1.5 pl-2 text-right font-semibold">Clean runs ({compare.clean})</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.rows.map((r) => {
                    const fmt = (v: number | null) => (v === null ? "—" : `${v.toFixed(r.decimals)}${r.unit}`)
                    const gap = r.withDefects !== null && r.clean !== null ? Math.abs(r.withDefects - r.clean) : 0
                    const notable = r.sensor === "temp" ? gap >= 1 : gap >= 0.2
                    return (
                      <tr key={r.label} className="border-t border-border">
                        <td className="py-1.5 pr-2">{r.label}</td>
                        <td className={cn("px-2 py-1.5 text-right tabular-nums", notable && "font-bold text-primary")}>{fmt(r.withDefects)}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums">{fmt(r.clean)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-1.5 text-xs text-muted-foreground">Bold: a gap of 1 °C or 0.2 pH or more between the two groups.</p>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
