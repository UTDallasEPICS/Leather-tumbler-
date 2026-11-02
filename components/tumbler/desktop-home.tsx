"use client"

// Home screen for the desktop layout: tumbler cards in the middle, Temperature and pH tiles on the right.
// Clicking a tile pops up every tumbler ranked by that reading.

import Link from "next/link"
import { ChevronRight, Droplets, LayoutGrid, Thermometer } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDashboard } from "@/lib/dashboard-context"
import { useRuns } from "@/lib/runs"
import { averageOf, clampPct, phPct, sortForCompare, tempPct, tumblerMeta, useTumblers, type TumblerInfo } from "@/lib/tumblers"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DrumIcon, PageTitle, SectionTitle, StatusDot, Sub, useGreeting } from "@/components/tumbler/parts"
import { Sparkline } from "@/components/tumbler/charts"
import { runShort } from "@/components/run/run-entry"

function Reading({
  label,
  value,
  tone,
  values,
  minSpan,
}: {
  label: string
  value: string
  tone: "red" | "brown"
  values: number[]
  minSpan: number
}) {
  return (
    <div className={cn("rounded-[14px] px-3 pt-2.5 pb-1.5", tone === "red" ? "bg-red-tint" : "bg-brown-tint")}>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="font-display text-2xl leading-tight font-bold tabular-nums">{value}</div>
      <Sparkline
        values={values}
        color={tone === "red" ? "var(--primary)" : "var(--brown)"}
        minSpan={minSpan}
        className="h-9 text-xs"
      />
    </div>
  )
}

function TumblerCard({ t }: { t: TumblerInfo }) {
  const run = useRuns().activeRun(t.id)
  const cyclePct = t.cycleTarget > 0 ? clampPct((t.cycles / t.cycleTarget) * 100) : 0
  return (
    <Link
      href={`/tumbler?id=${t.id}`}
      className="flex flex-col rounded-[22px] border-[1.5px] border-border bg-card p-4 transition-[border-color,box-shadow] hover:border-brown hover:shadow-[0_10px_24px_rgba(0,0,0,.08)]"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-[46px] shrink-0 place-items-center rounded-full bg-brown-tint text-brown">
          <DrumIcon className="size-[26px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold">{t.name}</span>
          {/* cycles and the offline reason are spelled out below, so the status line stays short */}
          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
            {!t.online ? "Offline" : t.running ? "Running" : run ? "Stopped" : "Ready · not running"}
            {run && ` · ${runShort(run)}`}
          </span>
        </span>
        <StatusDot online={t.online} />
      </div>

      {t.online ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Reading
              label="Temperature"
              value={t.temp === null ? "—" : `${t.temp.toFixed(1)}°`}
              tone="red"
              values={t.hist.temp}
              minSpan={4}
            />
            <Reading label="pH" value={t.ph === null ? "—" : t.ph.toFixed(1)} tone="brown" values={t.hist.ph} minSpan={0.5} />
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">Cycles</span>
              <span className="text-muted-foreground tabular-nums">
                {t.cycles} of {t.cycleTarget}
              </span>
            </div>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-[3px] bg-border">
              <i className="block h-full rounded-[3px] bg-brown transition-[width] duration-700" style={{ width: `${cyclePct}%` }} />
            </span>
          </div>
        </>
      ) : (
        <div className="mt-4 flex flex-1 flex-col justify-between rounded-[16px] bg-brown-tint p-3.5">
          <p className="text-sm text-muted-foreground">
            {t.isReal ? "The app can't reach this tumbler. Check power and Wi-Fi." : "This tumbler needs setting up before it can run."}
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brown">
            {t.isReal ? "Reconnect" : "Set it up"}
            <ChevronRight className="size-4" />
          </span>
        </div>
      )}
    </Link>
  )
}

const METRICS = {
  temp: { title: "Temperature", icon: Thermometer, tile: "bg-primary text-white", color: "var(--primary)", order: "Warmest first" },
  ph: { title: "pH level", icon: Droplets, tile: "bg-brown text-brown-foreground", color: "var(--brown)", order: "Highest first" },
}

/** The big Temperature / pH tile. Clicking it pops up every tumbler ranked by that reading. */
function MetricTile({ mode }: { mode: "temp" | "ph" }) {
  const { tumblers } = useTumblers()
  const { config } = useDashboard()
  const m = METRICS[mode]
  const live = tumblers.filter((t) => t.running)
  const avg = averageOf(live, mode)
  const pct = (v: number) => (mode === "temp" ? tempPct(v, config.heatLimit) : phPct(v))
  const fmt = (v: number) => (mode === "temp" ? `${v.toFixed(1)}°` : v.toFixed(1))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Compare tumblers by ${m.title.toLowerCase()}`}
          className={cn(
            "stitch flex min-h-[176px] w-full flex-col justify-between rounded-[26px] p-5 text-left transition-transform active:scale-[.98] data-[state=open]:ring-4 data-[state=open]:ring-ring/30",
            m.tile,
          )}
        >
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <m.icon className="size-5" />
            {m.title}
          </span>
          <span>
            <span className="font-display block text-[50px] leading-none font-bold tracking-tight tabular-nums">
              {avg === null ? "—" : mode === "temp" ? avg.toFixed(0) : avg.toFixed(1)}
              {mode === "temp" && avg !== null && <span className="ml-0.5 align-top text-[26px]">°C</span>}
            </span>
            <span className="mt-1.5 block text-[13px] opacity-90">
              {live.length ? `Average of ${live.length} running · click to compare` : "None running"}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={14}
        className="w-80 rounded-[20px] border-[1.5px] p-4 shadow-[0_14px_30px_rgba(0,0,0,.14)]"
      >
        <div className="font-display text-lg font-bold">{m.title} by tumbler</div>
        <p className="text-sm text-muted-foreground">{m.order}.</p>
        <ul className="mt-3 space-y-0.5">
          {sortForCompare(tumblers, mode).map((t) => {
            const v = t[mode]
            return (
              <li key={t.id}>
                <Link href={`/tumbler?id=${t.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-brown-tint">
                  <StatusDot online={t.online} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{t.name}</span>
                    {v === null ? (
                      <span className="block truncate text-xs text-muted-foreground">{tumblerMeta(t)}</span>
                    ) : (
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-[3px] bg-border">
                        <i className="block h-full rounded-[3px]" style={{ width: `${pct(v)}%`, background: m.color }} />
                      </span>
                    )}
                  </span>
                  <span className="font-display text-lg font-bold tabular-nums">{v === null ? "—" : fmt(v)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        <Link
          href={`/group?mode=${mode}`}
          className="mt-3 flex items-center justify-center gap-1 rounded-xl border-[1.5px] border-border py-2 text-sm font-semibold text-brown hover:border-brown hover:bg-brown-tint"
        >
          Open full comparison
          <ChevronRight className="size-4" />
        </Link>
      </PopoverContent>
    </Popover>
  )
}

function FleetCard({ tumblers }: { tumblers: TumblerInfo[] }) {
  const rows = [
    { label: "Running", count: tumblers.filter((t) => t.running).length, dot: "bg-success" },
    { label: "Ready", count: tumblers.filter((t) => t.online && !t.running).length, dot: "bg-tan" },
    { label: "Offline", count: tumblers.filter((t) => !t.online).length, dot: "bg-primary" },
  ]
  return (
    <div className="rounded-[22px] border-[1.5px] border-border bg-card px-4 py-3.5">
      <div className="font-semibold">Fleet</div>
      <ul className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 text-sm">
            <span className={cn("size-2.5 rounded-full", r.dot)} aria-hidden="true" />
            {r.label}
            <span className="font-display ml-auto text-lg font-bold tabular-nums">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DesktopHome() {
  const { tumblers } = useTumblers()
  const hello = useGreeting()
  const online = tumblers.filter((t) => t.online).length
  const running = tumblers.filter((t) => t.running).length
  const several = tumblers.length > 1

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>{hello}</PageTitle>
          <Sub>
            {online} of {tumblers.length} {several ? "tumblers are" : "tumbler is"} online · {running} running.
          </Sub>
        </div>
        {several && (
          <Link
            href="/group?mode=all"
            className="inline-flex items-center gap-2 rounded-xl border-[1.5px] border-border px-4 py-2.5 text-[15px] font-semibold transition-colors hover:border-brown hover:bg-brown-tint"
          >
            <LayoutGrid className="size-[18px] text-brown" />
            Group view
          </Link>
        )}
      </div>

      <div className="mt-7 grid grid-cols-[minmax(0,1fr)_280px] items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Your tumblers">
          <SectionTitle className="mt-0">Your tumblers</SectionTitle>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
            {tumblers.map((t) => (
              <TumblerCard key={t.id} t={t} />
            ))}
          </div>
        </section>

        <aside aria-label="Readings" className="sticky top-6 space-y-4">
          <MetricTile mode="temp" />
          <MetricTile mode="ph" />
          <FleetCard tumblers={tumblers} />
        </aside>
      </div>
    </div>
  )
}
