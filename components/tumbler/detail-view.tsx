"use client"

import { RefreshCcw } from "lucide-react"
import { useDashboard } from "@/lib/dashboard-context"
import { phPct, tempPct, type TumblerInfo } from "@/lib/tumblers"
import { BackLink, CtaButton, PageTitle, SectionTitle, StatusDot } from "@/components/tumbler/parts"
import { ChartCard, RpmGauge, Sparkline, Tube } from "@/components/tumbler/charts"
import { useDrumControl } from "@/components/tumbler/drum-control"
import { NewRunButton, RunCard } from "@/components/run/run-entry"

export function DetailView({ t }: { t: TumblerInfo }) {
  const { config, demoMode, resetCycles } = useDashboard()
  const drum = useDrumControl(t)

  const demoTag = !t.isReal ? "Demo tumbler" : demoMode ? "Demo mode" : null

  return (
    <div>
      <BackLink href="/">Home</BackLink>
      <div className="flex items-center gap-3">
        <NewRunButton t={t} />
        <PageTitle>{t.name}</PageTitle>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[15px] text-muted-foreground">
        <StatusDot online />
        <span>{t.running ? "Online · running" : "Online · stopped"}</span>
        {demoTag && (
          <span className="rounded-md bg-chart-3/25 px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-brown-dark uppercase">
            {demoTag}
          </span>
        )}
      </div>

      <RunCard t={t} />

      <div className="mt-[18px] grid grid-cols-[62px_1fr_62px] items-stretch gap-2">
        <Tube
          label={
            <>
              pH
              <br />
              level
            </>
          }
          value={t.ph === null ? "—" : t.ph.toFixed(1)}
          fill={t.ph === null ? 0 : phPct(t.ph)}
          color="var(--brown)"
        />

        <div className="flex flex-col items-center text-center">
          <div className="text-[15px] font-semibold text-muted-foreground">Cycles</div>
          <div className="font-display mt-0.5 mb-1.5 text-[38px] leading-tight font-bold tracking-tight tabular-nums">
            {t.cycles}
            <span className="text-[22px] font-semibold text-muted-foreground"> / {t.cycleTarget}</span>
          </div>
          <RpmGauge rpm={t.rpm} />
          <CtaButton variant={t.running ? "ghost" : "solid"} className="mt-2.5 py-4" onClick={drum.request}>
            {t.running ? "Stop" : "Start"}
          </CtaButton>
        </div>

        <Tube
          label={
            <>
              Temp-
              <br />
              erature
            </>
          }
          value={t.temp === null ? "—" : `${t.temp.toFixed(0)}°`}
          fill={t.temp === null ? 0 : tempPct(t.temp, config.heatLimit)}
          color="var(--primary)"
        />
      </div>

      {t.isReal && (
        <button
          type="button"
          onClick={resetCycles}
          className="mx-auto mt-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-brown-tint"
        >
          <RefreshCcw className="size-4" />
          Reset cycles
        </button>
      )}

      <div className="mt-6 mb-1 border-t-2 border-dashed border-tan" />
      <SectionTitle className="mt-[18px]">Last few minutes</SectionTitle>
      <ChartCard label="pH level" value={t.ph === null ? "—" : t.ph.toFixed(1)}>
        <Sparkline values={t.hist.ph} color="var(--brown)" minSpan={0.5} />
      </ChartCard>
      <ChartCard label="Temperature" value={t.temp === null ? "—" : `${t.temp.toFixed(1)}°C`}>
        <Sparkline values={t.hist.temp} color="var(--primary)" minSpan={4} />
      </ChartCard>
      {t.hist.rpm.length > 1 && (
        <ChartCard label="Drum speed" value={t.rpm === null ? "—" : `${t.rpm.toFixed(0)} rpm`}>
          <Sparkline values={t.hist.rpm} color="var(--foreground)" minSpan={4} />
        </ChartCard>
      )}

      {drum.dialogs}
    </div>
  )
}
