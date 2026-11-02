"use client"

import Link from "next/link"
import { ChevronRight, Droplets, LayoutGrid, Thermometer } from "lucide-react"
import { useIsDesktop } from "@/hooks/use-desktop"
import { useRuns } from "@/lib/runs"
import { averageOf, tumblerMeta, useTumblers } from "@/lib/tumblers"
import { SectionTitle, Sub, TumblerRow } from "@/components/tumbler/parts"
import { DesktopHome } from "@/components/tumbler/desktop-home"
import { runShort } from "@/components/run/run-entry"

export function HomeView() {
  return useIsDesktop() ? <DesktopHome /> : <PhoneHome />
}

function PhoneHome() {
  const { tumblers } = useTumblers()
  const { activeRun } = useRuns()

  const onlineCount = tumblers.filter((t) => t.online).length
  const live = tumblers.filter((t) => t.running)
  const avgTemp = averageOf(live, "temp")
  const avgPh = averageOf(live, "ph")
  const several = tumblers.length > 1
  const liveNote = live.length ? `Average of ${live.length} running` : "None running"

  return (
    <div>
      <h1 className="sr-only">Tumbler dashboard</h1>
      <Sub>
        {onlineCount} of {tumblers.length} {several ? "tumblers are" : "tumbler is"} online.
      </Sub>

      <div className="mt-5 grid grid-cols-2 gap-3.5">
        <Link
          href="/group?mode=temp"
          aria-label="Compare tumblers by temperature"
          className="stitch grid min-h-[156px] grid-rows-[auto_1fr_auto] gap-2 rounded-[26px] bg-primary p-4 text-white transition-transform active:scale-[.97] sm:min-h-[170px]"
        >
          <span className="flex items-center gap-1.5 text-[13px] font-semibold sm:text-[15px]">
            <Thermometer className="size-4 shrink-0 sm:size-5" />
            Temperature
          </span>
          <span className="font-display place-self-center text-center text-[44px] leading-none font-bold tracking-tight tabular-nums sm:text-[48px]">
            {avgTemp === null ? "—" : avgTemp.toFixed(0)}
            {avgTemp !== null && <span className="ml-0.5 align-top text-[22px]">°C</span>}
          </span>
          <span className="block text-center text-xs opacity-90 sm:text-[13px]">{liveNote}</span>
        </Link>

        <Link
          href="/group?mode=ph"
          aria-label="Compare tumblers by pH"
          className="stitch grid min-h-[156px] grid-rows-[auto_1fr_auto] gap-2 rounded-[26px] bg-brown p-4 text-brown-foreground transition-transform active:scale-[.97] sm:min-h-[170px]"
        >
          <span className="flex items-center gap-1.5 text-[13px] font-semibold sm:text-[15px]">
            <Droplets className="size-4 shrink-0 sm:size-5" />
            pH level
          </span>
          <span className="font-display place-self-center text-center text-[44px] leading-none font-bold tracking-tight tabular-nums sm:text-[48px]">
            {avgPh === null ? "—" : avgPh.toFixed(1)}
          </span>
          <span className="block text-center text-xs opacity-90 sm:text-[13px]">{liveNote}</span>
        </Link>
      </div>
      {several && <p className="mt-2.5 text-center text-[13px] text-muted-foreground">Tap a card to compare all tumblers</p>}

      <SectionTitle>Your tumblers</SectionTitle>
      {several && (
        <Link
          href="/group?mode=all"
          className="mb-3 flex w-full items-center gap-3.5 rounded-[18px] border-2 border-foreground p-4 text-left transition-colors hover:bg-brown-tint"
        >
          <span className="grid size-[46px] shrink-0 place-items-center rounded-full bg-brown-tint text-brown">
            <LayoutGrid className="size-[26px]" />
          </span>
          <span className="flex-1">
            <span className="block text-[17px] font-semibold">Group view</span>
            <span className="block text-sm text-muted-foreground">See every tumbler together</span>
          </span>
          <ChevronRight className="size-[18px] text-muted-foreground" />
        </Link>
      )}
      {tumblers.map((t) => {
        const run = activeRun(t.id)
        const meta = run ? `${!t.online ? "Offline" : t.running ? "Running" : "Stopped"} · ${runShort(run)}` : tumblerMeta(t)
        return <TumblerRow key={t.id} t={t} meta={meta} chevron />
      })}
    </div>
  )
}
