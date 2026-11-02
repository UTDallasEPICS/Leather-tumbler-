"use client"
// Analytics: what the reading log says right now, how the run went, the readings themselves and this session's alerts.
import { useMemo, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import {
  Activity,
  Bell,
  Download,
  Droplets,
  OctagonAlert,
  ShieldCheck,
  Thermometer,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { OVERHEAT_WARNING_TEMP, PH_WARNING_HIGH, PH_WARNING_LOW, useDashboard, type Config, type LogEntry } from "@/lib/dashboard-context"
import {
  eventLevel,
  fmtSpan,
  phInsight,
  phLevel,
  readingLevel,
  readingsCsv,
  seriesOf,
  statsOf,
  tempInsight,
  tempLevel,
  type Insight,
  type Level,
  type Point,
} from "@/lib/analytics"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { PageTitle, SectionTitle, Sub } from "@/components/tumbler/parts"

const LEVELS: Record<Level, { label: string; chip: string; text: string; tint: string; icon: string }> = {
  ok: { label: "OK", chip: "bg-success/15 text-success", text: "", tint: "bg-brown-tint", icon: "text-success" },
  warn: { label: "Warning", chip: "bg-chart-3/25 text-brown-dark", text: "text-brown-dark", tint: "bg-chart-3/20", icon: "text-brown" },
  stop: { label: "Over limit", chip: "bg-red-tint text-primary", text: "text-primary", tint: "bg-red-tint", icon: "text-primary" },
}

const card = "rounded-[18px] border-[1.5px] border-border"

const clock = (t: number | Date) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })

/** Round, evenly spaced axis ticks covering lo..hi (at most about six of them). */
function niceTicks(lo: number, hi: number): number[] {
  const step = [0.25, 0.5, 1, 2, 5, 10, 20, 50].find((s) => (hi - lo) / s <= 6) ?? 100
  const ticks: number[] = []
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + 1e-9; v += step) ticks.push(+v.toFixed(2))
  return ticks
}

function InsightCard({ insight, icon: Icon }: { insight: Insight; icon: LucideIcon }) {
  const tone = LEVELS[insight.level]
  return (
    <div className={cn("flex gap-3 rounded-[18px] p-4", tone.tint)}>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-background", tone.icon)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{insight.title}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{insight.detail}</p>
      </div>
    </div>
  )
}

function StatTile({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub: string }) {
  return (
    <div className={cn(card, "p-4")}>
      <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Icon className="size-4 text-brown" />
        {label}
      </div>
      <div className="font-display mt-1 text-[30px] leading-tight font-bold tabular-nums">{value}</div>
      <div className="text-[13px] text-muted-foreground">{sub}</div>
    </div>
  )
}

/** Reading over time, with the safe range shaded and warning / stop levels drawn across it. */
function ReadingChart({
  id,
  name,
  points,
  color,
  unit,
  decimals,
  domain,
  band,
  lines,
}: {
  id: string
  name: string
  points: Point[]
  color: string
  unit: string
  decimals: number
  domain: [number, number]
  band: [number, number]
  lines: { y: number; label: string; color: string }[]
}) {
  const ticks = niceTicks(domain[0], domain[1])
  return (
    <div className={cn(card, "h-60 px-1 pt-4 pb-1")}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <ReferenceArea
            y1={Math.max(band[0], ticks[0])}
            y2={band[1]}
            fill="var(--success)"
            fillOpacity={0.08}
            ifOverflow="hidden"
          />
          {lines.map((l) => (
            <ReferenceLine
              key={l.label}
              y={l.y}
              stroke={l.color}
              strokeDasharray="5 4"
              label={{ value: l.label, position: "insideTopRight", fill: l.color, fontSize: 11 }}
            />
          ))}
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={clock}
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
          />
          <YAxis
            domain={[ticks[0], ticks[ticks.length - 1]]}
            ticks={ticks}
            width={42}
            tickFormatter={(v: number) => `${v}${unit}`}
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            labelFormatter={(t) => clock(Number(t))}
            formatter={(v) => [`${Number(v).toFixed(decimals)}${unit}`, name]}
            contentStyle={{
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1.5px solid var(--border)",
              borderRadius: 12,
              fontSize: 13,
            }}
          />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function ReadingsTable({ logs, config }: { logs: LogEntry[]; config: Config }) {
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const rows = logs.map((l) => ({ l, level: readingLevel(l, config) }))
  const shown = onlyFlagged ? rows.filter((r) => r.level !== "ok") : rows

  return (
    <div className={cn(card, "overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="text-sm text-muted-foreground">Newest first</span>
        <div role="radiogroup" aria-label="Which readings" className="grid grid-cols-2 gap-1 rounded-xl bg-brown-tint p-1">
          {[false, true].map((flagged) => (
            <button
              key={String(flagged)}
              type="button"
              role="radio"
              aria-checked={onlyFlagged === flagged}
              onClick={() => setOnlyFlagged(flagged)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                onlyFlagged === flagged ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {flagged ? "Out of range" : `All ${rows.length}`}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="sticky top-0 bg-background text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Time</th>
              <th className="px-2 py-2 text-right font-semibold">Temp</th>
              <th className="px-2 py-2 text-right font-semibold">pH</th>
              <th className="px-4 py-2 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map(({ l, level }, i) => (
              <tr key={i}>
                <td className="px-4 py-2 text-muted-foreground">{clock(l.timestamp)}</td>
                <td className={cn("px-2 py-2 text-right font-medium", LEVELS[tempLevel(l.temperature, config)].text)}>
                  {l.temperature > 0 ? `${l.temperature.toFixed(1)}°C` : "—"}
                </td>
                <td className={cn("px-2 py-2 text-right font-medium", LEVELS[phLevel(l.ph, config)].text)}>{l.ph.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase", LEVELS[level].chip)}>
                    {LEVELS[level].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {rows.length ? "No readings out of range. Everything stayed in the safe range." : "No readings yet."}
          </p>
        )}
      </div>
    </div>
  )
}

const EVENT_ICONS: Record<Level, LucideIcon> = { ok: Bell, warn: TriangleAlert, stop: OctagonAlert }

function EventsList() {
  const { notificationLogs, clearNotificationLogs } = useDashboard()
  if (!notificationLogs.length) {
    return <p className={cn(card, "px-4 py-10 text-center text-sm text-muted-foreground")}>No alerts or events yet this session.</p>
  }
  return (
    <div className={card}>
      <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
        {notificationLogs.map((e) => {
          const level = eventLevel(e)
          const Icon = EVENT_ICONS[level]
          return (
            <li key={e.id} className="flex gap-3 px-4 py-3">
              <Icon className={cn("mt-0.5 size-4 shrink-0", level === "ok" ? "text-muted-foreground" : LEVELS[level].icon)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug font-medium">{e.body || e.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{clock(e.timestamp)}</p>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="border-t border-border px-4 py-2 text-right">
        <button type="button" onClick={clearNotificationLogs} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          Clear
        </button>
      </div>
    </div>
  )
}

const toolButton =
  "inline-flex items-center gap-2 rounded-xl border-[1.5px] border-border px-3.5 py-2 text-sm font-semibold transition-colors hover:border-brown hover:bg-brown-tint disabled:pointer-events-none disabled:opacity-50"

export function AnalyticsView() {
  const { logs, config, isRunning, clearLogs } = useDashboard()
  const [confirmClear, setConfirmClear] = useState(false)

  const temp = useMemo(() => seriesOf(logs, "temperature"), [logs])
  const ph = useMemo(() => seriesOf(logs, "ph"), [logs])
  const tStats = statsOf(temp)
  const pStats = statsOf(ph)
  const levels = logs.map((l) => readingLevel(l, config))
  const okShare = levels.length ? levels.filter((l) => l === "ok").length / levels.length : null
  const flagged = levels.filter((l) => l !== "ok").length
  const times = [...temp, ...ph].map((p) => p.t)
  const span = times.length ? Math.max(...times) - Math.min(...times) : 0
  const tInsight = tempInsight(temp, config, isRunning)
  const pInsight = phInsight(ph, config, isRunning)

  // a browser can save the file; the Android app's web view can't, so the button only shows on the web
  const canExport = Capacitor.getPlatform() === "web"
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([readingsCsv(logs, config)], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `tumbler-readings-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // the temperature chart always shows the warning line, and the stop limit once readings get near it
  const tempTop = Math.max(tStats?.max ?? 0, OVERHEAT_WARNING_TEMP, (tStats?.max ?? 0) >= OVERHEAT_WARNING_TEMP ? config.heatLimit : 0)
  const tempDomain: [number, number] = [Math.floor((tStats?.min ?? OVERHEAT_WARNING_TEMP) - 2), Math.ceil(tempTop + 2)]
  const phLow = Math.min(pStats?.min ?? PH_WARNING_LOW, PH_WARNING_LOW)
  const phHigh = Math.max(pStats?.max ?? PH_WARNING_HIGH, PH_WARNING_HIGH)
  const phDomain: [number, number] = [Math.floor(phLow * 2 - 1) / 2, Math.ceil(phHigh * 2 + 1) / 2]

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Analytics</PageTitle>
          <Sub>
            {logs.length
              ? `${isRunning ? "Live" : "Last run"} · ${logs.length} readings over ${fmtSpan(span)}`
              : "No readings yet. They're recorded while the tumbler runs."}
          </Sub>
        </div>
        <div className="flex gap-2">
          {canExport && (
            <button type="button" onClick={exportCsv} disabled={!logs.length} className={toolButton}>
              <Download className="size-4 text-brown" />
              Export CSV
            </button>
          )}
          <button type="button" onClick={() => setConfirmClear(true)} disabled={!logs.length} className={toolButton}>
            <Trash2 className="size-4 text-brown" />
            Clear readings
          </button>
        </div>
      </div>

      {logs.length > 0 && (
        <>
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {tInsight && <InsightCard insight={tInsight} icon={Thermometer} />}
            {pInsight && <InsightCard insight={pInsight} icon={Droplets} />}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              icon={Thermometer}
              label="Avg temp"
              value={tStats ? `${tStats.avg.toFixed(1)}°` : "—"}
              sub={tStats ? `${tStats.min.toFixed(1)}–${tStats.max.toFixed(1)}°C range` : "No readings"}
            />
            <StatTile
              icon={Droplets}
              label="Avg pH"
              value={pStats ? pStats.avg.toFixed(2) : "—"}
              sub={pStats ? `${pStats.min.toFixed(2)}–${pStats.max.toFixed(2)} range` : "No readings"}
            />
            <StatTile
              icon={ShieldCheck}
              label="In safe range"
              value={okShare === null ? "—" : `${Math.round(okShare * 100)}%`}
              sub={`Under ${OVERHEAT_WARNING_TEMP}°C, pH ${PH_WARNING_LOW}–${PH_WARNING_HIGH}`}
            />
            <StatTile icon={Activity} label="Out of range" value={String(flagged)} sub={flagged === 1 ? "reading flagged" : "readings flagged"} />
          </div>

          <div className="grid gap-x-6 lg:grid-cols-2">
            <section>
              <SectionTitle>Temperature</SectionTitle>
              <ReadingChart
                id="analytics-temp-fill"
                name="Temperature"
                points={temp}
                color="var(--primary)"
                unit="°"
                decimals={1}
                domain={tempDomain}
                band={[tempDomain[0], OVERHEAT_WARNING_TEMP]}
                lines={[
                  { y: OVERHEAT_WARNING_TEMP, label: `Warning ${OVERHEAT_WARNING_TEMP}°`, color: "var(--tan)" },
                  { y: config.heatLimit, label: `Stop ${config.heatLimit}°`, color: "var(--primary)" },
                ]}
              />
            </section>
            <section>
              <SectionTitle>pH level</SectionTitle>
              <ReadingChart
                id="analytics-ph-fill"
                name="pH"
                points={ph}
                color="var(--brown)"
                unit=""
                decimals={2}
                domain={phDomain}
                band={[PH_WARNING_LOW, PH_WARNING_HIGH]}
                lines={[
                  { y: config.phLowLimit, label: `Stop ${config.phLowLimit}`, color: "var(--primary)" },
                  { y: config.phHighLimit, label: `Stop ${config.phHighLimit}`, color: "var(--primary)" },
                ]}
              />
            </section>
          </div>
        </>
      )}

      <div className="grid items-start gap-x-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <SectionTitle>Readings</SectionTitle>
          <ReadingsTable logs={logs} config={config} />
        </section>
        <section>
          <SectionTitle>Alerts &amp; events</SectionTitle>
          <EventsList />
        </section>
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all readings?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the {logs.length} saved temperature and pH readings from the tumbler. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={clearLogs}>Clear readings</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
