"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, Droplets, LayoutGrid, Thermometer } from "lucide-react"
import { averageOf, tumblerMeta, useTumblers } from "@/lib/tumblers"
import { PageTitle, SectionTitle, Sub, TumblerRow } from "@/components/tumbler/parts"

export function HomeView() {
  const { tumblers } = useTumblers()
  const [hello, setHello] = useState("Hello")

  // Time of day is read after mount so the static page and the browser agree on first paint.
  useEffect(() => {
    const h = new Date().getHours()
    setHello(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening")
  }, [])

  const onlineCount = tumblers.filter((t) => t.online).length
  const live = tumblers.filter((t) => t.running)
  const avgTemp = averageOf(live, "temp")
  const avgPh = averageOf(live, "ph")
  const several = tumblers.length > 1
  const liveNote = live.length ? `Average of ${live.length} running` : "None running"

  return (
    <div>
      <PageTitle>{hello}</PageTitle>
      <Sub>
        {onlineCount} of {tumblers.length} {several ? "tumblers are" : "tumbler is"} online.
      </Sub>

      <div className="mt-5 grid grid-cols-2 gap-3.5">
        <Link
          href="/group?mode=temp"
          aria-label="Compare tumblers by temperature"
          className="stitch flex aspect-square flex-col justify-between rounded-[26px] bg-primary p-[18px] text-left text-white transition-transform active:scale-[.97]"
        >
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <Thermometer className="size-5" />
            Temperature
          </span>
          <span>
            <span className="font-display block text-[50px] leading-none font-bold tracking-tight">
              {avgTemp === null ? "—" : avgTemp.toFixed(0)}
              {avgTemp !== null && <span className="ml-0.5 align-top text-[26px]">°C</span>}
            </span>
            <span className="mt-1.5 block text-[13px] opacity-90">{liveNote}</span>
          </span>
        </Link>

        <Link
          href="/group?mode=ph"
          aria-label="Compare tumblers by pH"
          className="stitch flex aspect-square flex-col justify-between rounded-[26px] bg-brown p-[18px] text-left text-brown-foreground transition-transform active:scale-[.97]"
        >
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <Droplets className="size-5" />
            pH level
          </span>
          <span>
            <span className="font-display block text-[50px] leading-none font-bold tracking-tight">
              {avgPh === null ? "—" : avgPh.toFixed(1)}
            </span>
            <span className="mt-1.5 block text-[13px] opacity-90">{liveNote}</span>
          </span>
        </Link>
      </div>
      {several && <p className="mt-2.5 text-center text-[13px] text-muted-foreground">Tap a square to compare all tumblers</p>}

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
      {tumblers.map((t) => (
        <TumblerRow key={t.id} t={t} meta={tumblerMeta(t)} chevron />
      ))}
    </div>
  )
}
