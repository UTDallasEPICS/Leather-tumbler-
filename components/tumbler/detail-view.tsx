"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronRight, ListChecks, RefreshCcw } from "lucide-react"
import { useDashboard } from "@/lib/dashboard-context"
import { phPct, tempPct, useTumblers, type TumblerInfo } from "@/lib/tumblers"
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
import { Checkbox } from "@/components/ui/checkbox"
import { BackLink, CtaButton, PageTitle, SectionTitle, StatusDot } from "@/components/tumbler/parts"
import { ChartCard, RpmGauge, Sparkline, Tube } from "@/components/tumbler/charts"

export function DetailView({ t }: { t: TumblerInfo }) {
  const { config, demoMode, start, stop, resetCycles } = useDashboard()
  const { toggleDemo } = useTumblers()
  const [confirmStart, setConfirmStart] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [closed, setClosed] = useState(false)

  const demoTag = !t.isReal ? "Demo tumbler" : demoMode ? "Demo mode" : null

  const askToStart = () => {
    setLoaded(false)
    setClosed(false)
    setConfirmStart(true)
  }
  const doStart = () => {
    setConfirmStart(false)
    if (t.isReal) void start()
    else toggleDemo(t.id)
  }
  const doStop = () => {
    setConfirmStop(false)
    if (t.isReal) void stop()
    else toggleDemo(t.id)
  }

  return (
    <div>
      <BackLink href="/">Home</BackLink>
      <PageTitle>{t.name}</PageTitle>
      <div className="mt-2 flex items-center gap-2 text-[15px] text-muted-foreground">
        <StatusDot online />
        <span>{t.running ? "Online · running" : "Online · stopped"}</span>
        {demoTag && (
          <span className="rounded-md bg-chart-3/25 px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-brown-dark uppercase">
            {demoTag}
          </span>
        )}
      </div>

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
          <CtaButton
            variant={t.running ? "ghost" : "solid"}
            className="mt-2.5 py-4"
            onClick={() => (t.running ? setConfirmStop(true) : askToStart())}
          >
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

      <Link
        href={`/setup?id=${t.id}`}
        className="mt-4 flex items-center gap-3 rounded-[18px] border-[1.5px] border-border p-3.5 transition-colors hover:border-brown hover:bg-brown-tint"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brown-tint text-brown">
          <ListChecks className="size-5" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">Setup guide</span>
          <span className="block text-sm text-muted-foreground">Steps and timers for {t.name}</span>
        </span>
        <ChevronRight className="size-[18px] text-muted-foreground" />
      </Link>

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

      <AlertDialog open={confirmStart} onOpenChange={setConfirmStart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ready to start?</AlertDialogTitle>
            <AlertDialogDescription>Check both before the drum turns.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={loaded} onCheckedChange={(v) => setLoaded(v === true)} />
              The drum is loaded and ready.
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={closed} onCheckedChange={(v) => setClosed(v === true)} />
              The lid is closed and secured.
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction disabled={!(loaded && closed)} onClick={doStart}>
              Start tumbling
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop tumbling?</AlertDialogTitle>
            <AlertDialogDescription>The drum will slow down and stop. You can start it again any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction onClick={doStop}>Stop the tumbler</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
