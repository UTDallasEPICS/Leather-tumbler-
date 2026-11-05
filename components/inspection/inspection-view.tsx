"use client"
// Inspection: check hides with the defect model, see how good it is, which defects show up and which parts of
// the process go with them.
import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { Camera, CircleAlert, Layers, RefreshCw, ScanSearch, ServerOff, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRuns, type Run } from "@/lib/runs"
import { getVisionOrigin } from "@/lib/settings"
import { useTumblers } from "@/lib/tumblers"
import { useVision } from "@/lib/use-vision"
import { isDefect, type Inspection } from "@/lib/vision"
import { pct, runDefects, testRates } from "@/lib/vision-insights"
import { demoReset } from "@/lib/vision-demo"
import { PageTitle, Sub } from "@/components/tumbler/parts"
import { CheckHide } from "@/components/inspection/check-hide"
import { DefectsPanel } from "@/components/inspection/defects-panel"
import { ModelQuality } from "@/components/inspection/model-quality"
import { PhotoGrid } from "@/components/inspection/photo-grid"
import { ProcessPanel } from "@/components/inspection/process-panel"
import { card } from "@/components/inspection/shared"

const ALL = 0

export function InspectionView() {
  const vision = useVision()
  const { tumblers } = useTumblers()
  const { history, activeRun } = useRuns()
  const [only, setOnly] = useState(ALL)

  const tumblerName = useCallback((id: number) => tumblers.find((t) => t.id === id)?.name ?? `Tumbler ${id}`, [tumblers])
  const threshold = vision.status?.threshold ?? 0.5

  const list = useMemo(() => (only === ALL ? vision.list : vision.list.filter((i) => i.tumblerId === only)), [vision.list, only])
  const ids = useMemo(() => (only === ALL ? tumblers.map((t) => t.id) : [only]), [tumblers, only])
  const runs = useMemo(() => ids.flatMap((id) => history(id)), [ids, history])
  const active = useMemo(() => ids.map((id) => activeRun(id)).filter((r): r is Run => !!r), [ids, activeRun])
  const stats = useMemo(() => runDefects(runs, list, threshold), [runs, list, threshold])

  const runName = useCallback(
    (i: Inspection) => {
      const t = i.tumblerId !== null ? tumblerName(i.tumblerId) : "No tumbler"
      const r = i.runId ? [...runs, ...active].find((x) => x.id === i.runId) : undefined
      return r ? `${t} · Run ${r.number}` : i.runId ? `${t} · earlier run` : t
    },
    [tumblerName, runs, active],
  )

  const defective = list.filter((i) => isDefect(i, threshold)).length
  const unchecked = list.filter((i) => !i.label && i.score >= threshold).length
  const test = vision.status?.metrics ? testRates(vision.status.metrics, threshold) : null

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Inspection</PageTitle>
          <Sub>
            {vision.demo
              ? "Demo Mode: real model results on public leather photos, linked to made-up runs."
              : vision.connection === "ready"
                ? `Defect model on ${getVisionOrigin().replace("http://", "")}`
                : "Leather photos checked by the defect model."}
          </Sub>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={only}
            onChange={(e) => setOnly(Number(e.target.value))}
            aria-label="Show tumbler"
            className="h-10 rounded-[12px] border-[1.5px] border-border bg-background px-3 text-sm font-medium"
          >
            <option value={ALL}>All tumblers</option>
            {tumblers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => vision.reload()} className={toolButton}>
            <RefreshCw className="size-4 text-brown" />
            Refresh
          </button>
          {vision.demo && (
            <button
              type="button"
              onClick={() => {
                demoReset()
                vision.reload()
              }}
              className={toolButton}
            >
              Reset demo
            </button>
          )}
        </div>
      </div>

      {vision.connection === "offline" && !vision.demo ? (
        <div className={cn(card, "mt-6 flex gap-4 p-5")}>
          <ServerOff className="mt-0.5 size-6 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">Can&apos;t reach the inspection server at {getVisionOrigin()}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The defect model runs on a laptop or mini PC on the same Wi-Fi, not on the tumbler controller. Start it there with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">python service.py</code> in the <code className="rounded bg-muted px-1 py-0.5 text-xs">vision</code>{" "}
              folder, then set its address under Connection. Or turn on Demo Mode to look around.
            </p>
            {vision.error && <p className="mt-1 text-xs text-muted-foreground">({vision.error})</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => vision.reload()} className={toolButton}>
                <RefreshCw className="size-4 text-brown" />
                Try again
              </button>
              <Link href="/settings" className={toolButton}>
                Connection settings
              </Link>
            </div>
          </div>
        </div>
      ) : vision.connection === "loading" || !vision.status ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={Camera} label="Photos checked" value={String(list.length)} sub={`${stats.length} runs with photos`} />
            <Tile
              icon={Layers}
              label="Defective"
              value={list.length ? pct(defective / list.length) : "—"}
              sub={`${defective} of ${list.length} hides`}
              warn={list.length > 0 && defective / list.length >= 0.25}
            />
            <Tile icon={CircleAlert} label="Waiting for a check" value={String(unchecked)} sub="flagged, nobody has looked yet" warn={unchecked > 0} />
            <Tile
              icon={ScanSearch}
              label="Model catches"
              value={test ? pct(test.caught / Math.max(1, test.defects)) : "—"}
              sub={test ? `of test defects, ${test.falseAlarms} false alarm${test.falseAlarms === 1 ? "" : "s"}` : "not tested yet"}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <CheckHide vision={vision} threshold={threshold} />
            <ModelQuality status={vision.status} list={list} demo={vision.demo} onSave={vision.setThreshold} />
            <DefectsPanel list={list} threshold={threshold} stats={stats} tumblerName={tumblerName} />
            <ProcessPanel stats={stats} active={active} tumblerName={tumblerName} />
          </div>

          <div className="mt-4">
            <PhotoGrid list={list} threshold={threshold} runName={runName} onLabel={vision.label} onRemove={vision.remove} />
          </div>

          {vision.demo && (
            <p className="mt-4 text-xs text-muted-foreground">
              Demo photos: MVTec AD leather (MVTec Software GmbH), CC BY-NC-SA 4.0. Bergmann et al., &quot;The MVTec Anomaly Detection Dataset&quot;, IJCV 2021.
            </p>
          )}
        </>
      )}
    </div>
  )
}

const toolButton =
  "inline-flex h-10 items-center gap-2 rounded-[12px] border-[1.5px] border-border px-3.5 text-sm font-semibold hover:bg-brown-tint disabled:opacity-50"

function Tile({ icon: Icon, label, value, sub, warn }: { icon: LucideIcon; label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={cn(card, "p-4", warn && "border-chart-3 bg-chart-3/10")}>
      <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Icon className="size-4 text-brown" />
        {label}
      </div>
      <div className="font-display mt-1 text-[30px] leading-tight font-bold tabular-nums">{value}</div>
      <div className="text-[13px] text-muted-foreground">{sub}</div>
    </div>
  )
}
