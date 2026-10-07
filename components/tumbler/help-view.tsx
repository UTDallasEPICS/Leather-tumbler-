"use client"

import { BackLink, PageTitle, Sub } from "@/components/tumbler/parts"

const ITEMS: [string, string][] = [
  [
    "Choose a tumbler",
    "Tap a tumbler on Home. A green dot and “Online” mean its dashboard is ready. A red dot means the app can't reach it.",
  ],
  [
    "If a tumbler is offline",
    "Check that it is powered on and on the same Wi-Fi as this phone, then tap Try again. If the address changed, update it under Connection.",
  ],
  [
    "Compare your tumblers",
    "Tap the temperature or pH square on Home to see every tumbler ranked by that reading. Tumblers that aren't running have no live reading.",
  ],
  [
    "Start and stop",
    "Tap Start on a tumbler's page and confirm that the drum is loaded and the lid is closed. Stop asks you to confirm before the drum slows down.",
  ],
  [
    "Warnings and emergency stop",
    "The app sounds an alarm when temperature passes 35 °C or pH leaves 6–8. The tumbler is stopped automatically at the heat and pH limits set under Configure, while this app is open.",
  ],
  [
    "Demo mode",
    "Demo mode is on until you turn it off under Connection. It simulates readings, and it adds demo tumblers 2–5 that don't control any real machine.",
  ],
]

export function HelpView() {
  return (
    <div>
      <BackLink href="/">Home</BackLink>
      <PageTitle>Help</PageTitle>
      <Sub>Everything you need to find your way.</Sub>
      <div className="mt-4">
        {ITEMS.map(([heading, body]) => (
          <section key={heading} className="border-b border-border py-4">
            <h2 className="font-display text-lg font-bold">{heading}</h2>
            <p className="mt-1.5 text-[15px] leading-snug text-muted-foreground">{body}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
