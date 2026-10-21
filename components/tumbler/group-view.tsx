"use client"

import { useSearchParams } from "next/navigation"
import { useDashboard } from "@/lib/dashboard-context"
import { phPct, tempPct, tumblerMeta, useTumblers, type TumblerInfo } from "@/lib/tumblers"
import { BackLink, PageTitle, Sub, TumblerRow } from "@/components/tumbler/parts"

type Mode = "temp" | "ph" | "all"

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

  // online with a reading first, then online without one, then offline
  const rank = (t: TumblerInfo) => (!t.online ? 2 : mode !== "all" && t[mode] === null ? 1 : 0)
  const list = [...tumblers].sort(
    (a, b) => rank(a) - rank(b) || (mode === "all" ? a.id - b.id : (b[mode] ?? 0) - (a[mode] ?? 0)),
  )

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
