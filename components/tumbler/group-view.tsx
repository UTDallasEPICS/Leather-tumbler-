"use client"

import { useSearchParams } from "next/navigation"
import { useDashboard } from "@/lib/dashboard-context"
import { phPct, sortForCompare, tempPct, tumblerMeta, useTumblers, type CompareMode as Mode } from "@/lib/tumblers"
import { BackLink, PageTitle, Sub, TumblerRow } from "@/components/tumbler/parts"

const TITLES: Record<Mode, string> = { temp: "Temperature", ph: "pH level", all: "All tumblers" }
const SUBS: Record<Mode, string> = {
  temp: "Warmest first. Tap a tumbler to open it.",
  ph: "Highest first. Tap a tumbler to open it.",
  all: "Tap a tumbler to open it.",
}

export function GroupView() {
  const raw = useSearchParams().get("mode")
  const mode: Mode = raw === "temp" || raw === "ph" ? raw : "all"
  const { tumblers } = useTumblers()
  const { config } = useDashboard()

  const list = sortForCompare(tumblers, mode)

  return (
    <div>
      <BackLink href="/">Home</BackLink>
      <PageTitle>{TITLES[mode]}</PageTitle>
      <Sub>{SUBS[mode]}</Sub>
      <div className="mt-5">
        {list.map((t) => {
          if (mode === "all") {
            const meta =
              t.online && t.temp !== null && t.ph !== null
                ? `${t.temp.toFixed(0)}°C · pH ${t.ph.toFixed(1)}`
                : tumblerMeta(t)
            return <TumblerRow key={t.id} t={t} meta={meta} />
          }
          const reading = t[mode]
          if (reading === null) return <TumblerRow key={t.id} t={t} meta={tumblerMeta(t)} />
          return (
            <TumblerRow
              key={t.id}
              t={t}
              meta={tumblerMeta(t)}
              value={mode === "temp" ? `${reading.toFixed(1)}°C` : reading.toFixed(1)}
              bar={{
                pct: mode === "temp" ? tempPct(reading, config.heatLimit) : phPct(reading),
                color: mode === "temp" ? "var(--primary)" : "var(--brown)",
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
