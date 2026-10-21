"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Power } from "lucide-react"
import { useDashboard } from "@/lib/dashboard-context"
import { getSettings } from "@/lib/settings"
import type { TumblerInfo } from "@/lib/tumblers"
import { BackLink, CtaButton, PageTitle, StatusDot, Sub } from "@/components/tumbler/parts"

/** Shown for the real tumbler while the app can't reach the backend. Keeps the relay fallback reachable. */
export function OfflineCard({ t }: { t: TumblerInfo }) {
  const { connectionStatus, isRunning, reconnect, shellyDirectOn, shellyDirectOff } = useDashboard()
  const [target, setTarget] = useState("")
  const [direct, setDirect] = useState(false)

  useEffect(() => {
    const s = getSettings()
    setTarget(`${s.serverIp}:${s.serverPort}`)
    setDirect(s.shellyDirectEnabled && !!s.shellyIp)
  }, [])

  const connecting = connectionStatus === "connecting"

  return (
    <div>
      <BackLink href="/">Home</BackLink>
      <PageTitle>{t.name}</PageTitle>
      <div className="mt-2 flex items-center gap-2 text-[15px] text-muted-foreground">
        <StatusDot online={false} />
        <span>{connecting ? "Connecting…" : "Offline"}</span>
      </div>

      <div className="mt-6 rounded-[20px] bg-brown-tint p-[18px]">
        <p className="font-semibold">{connecting ? "Looking for the tumbler…" : "The app can't reach the tumbler"}</p>
        <Sub>Check that it is powered on and on the same Wi-Fi as this phone, then try again.</Sub>
        {target && <p className="mt-3 text-[13px] text-muted-foreground">Looking at {target}</p>}
      </div>

      <CtaButton className="mt-4" onClick={reconnect} disabled={connecting}>
        {connecting ? "Connecting…" : "Try again"}
      </CtaButton>
      <Link
        href="/settings"
        className="mt-2.5 block w-full rounded-[18px] border-2 border-primary px-4 py-3.5 text-center text-base font-semibold text-primary hover:bg-red-tint"
      >
        Open connection settings
      </Link>

      {direct && (
        <div className="mt-6 rounded-[20px] border-[1.5px] border-border p-[18px]">
          <p className="font-semibold">Direct relay control</p>
          <Sub>The tumbler can&apos;t be reached, but the relay can be switched directly. Readings and alarms are unavailable this way.</Sub>
          <p className="mt-2 text-sm font-semibold">{isRunning ? "Relay is on" : "Relay is off"}</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <CtaButton className="py-3.5 text-base" onClick={() => void shellyDirectOn()}>
              <Power className="mr-1.5 inline size-4 align-text-bottom" />
              Turn on
            </CtaButton>
            <CtaButton variant="ghost" className="py-3.5 text-base" onClick={() => void shellyDirectOff()}>
              <Power className="mr-1.5 inline size-4 align-text-bottom" />
              Turn off
            </CtaButton>
          </div>
        </div>
      )}
    </div>
  )
}
