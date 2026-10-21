"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTumblers } from "@/lib/tumblers"
import { BackLink, PageTitle, Sub } from "@/components/tumbler/parts"
import { DetailView } from "@/components/tumbler/detail-view"
import { DemoSetup } from "@/components/tumbler/demo-setup"
import { OfflineCard } from "@/components/tumbler/offline-card"

/** Picks the right screen for /tumbler?id=N: live detail, offline help, or demo setup. */
export function TumblerView() {
  const raw = Number(useSearchParams().get("id") ?? 1)
  const id = Number.isFinite(raw) ? raw : 1
  const { getTumbler } = useTumblers()
  const t = getTumbler(id)

  // Demo tumblers appear one effect after mount; wait so a direct link doesn't flash "not found".
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  if (!t) {
    if (!ready) return null
    return (
      <div>
        <BackLink href="/">Home</BackLink>
        <PageTitle>Tumbler not found</PageTitle>
        <Sub>That tumbler isn&apos;t available right now. Demo tumblers only appear while Demo Mode is on (Connection settings).</Sub>
      </div>
    )
  }

  if (t.online) return <DetailView t={t} />
  return t.isReal ? <OfflineCard t={t} /> : <DemoSetup t={t} />
}
