"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { useTumblers, type TumblerInfo } from "@/lib/tumblers"
import { cn } from "@/lib/utils"
import { BackLink, CtaButton, PageTitle, Sub } from "@/components/tumbler/parts"

type Key = "temp" | "ph" | "water"

const FIELDS: { k: Key; label: string; hint: string; step: number; min: number; max: number; fmt: (v: number) => string }[] = [
  { k: "temp", label: "Temperature", hint: "How warm the water should be", step: 1, min: 30, max: 50, fmt: (v) => `${v}°C` },
  { k: "ph", label: "pH level", hint: "How acidic the mix should be", step: 0.1, min: 3, max: 5, fmt: (v) => v.toFixed(1) },
  { k: "water", label: "Water", hint: "How much water goes in the drum", step: 5, min: 10, max: 60, fmt: (v) => `${v} L` },
]

const RECOMMENDED: Record<Key, number> = { temp: 40, ph: 4.0, water: 30 }

/**
 * "Set up a tumbler" for demo placeholders. It has nothing to talk to yet: the real backend has no
 * per-batch targets or timed runs, so starting here only brings the demo tumbler online.
 */
export function DemoSetup({ t }: { t: TumblerInfo }) {
  const { bringOnline } = useTumblers()
  const [values, setValues] = useState<Partial<Record<Key, number>>>({})

  const chosen = FIELDS.filter((f) => values[f.k] !== undefined).length
  const all = chosen === FIELDS.length

  const step = (k: Key, dir: 1 | -1) => {
    const f = FIELDS.find((x) => x.k === k)!
    setValues((prev) => {
      const cur = prev[k]
      if (cur === undefined) return { ...prev, [k]: RECOMMENDED[k] }
      const next = Math.round(Math.max(f.min, Math.min(f.max, cur + f.step * dir)) * 10) / 10
      return { ...prev, [k]: next }
    })
  }

  return (
    <div>
      <BackLink href="/">Home</BackLink>
      <PageTitle>Set up {t.name}</PageTitle>
      <Sub>This tumbler is offline. Choose three settings before you start.</Sub>
      <p className="mt-3 rounded-xl bg-chart-3/20 px-3 py-2 text-[13px] text-brown-dark">
        Demo tumbler: nothing here controls a real machine.
      </p>

      <div className="mt-5">
        {FIELDS.map((f) => {
          const v = values[f.k]
          return (
            <div key={f.k} className={cn("mb-3 flex items-center gap-3 rounded-[20px] bg-brown-tint p-3.5", v !== undefined && "ok")}>
              <span
                className={cn(
                  "grid size-[26px] shrink-0 place-items-center rounded-full border-2",
                  v !== undefined ? "border-success bg-success text-white" : "border-tan text-transparent",
                )}
              >
                <Check className="size-3.5" strokeWidth={3.2} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[17px]">{f.label}</b>
                <small className="mt-0.5 block text-[13px] leading-tight text-muted-foreground">{f.hint}</small>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`Lower ${f.label}`}
                  onClick={() => step(f.k, -1)}
                  className="size-11 rounded-full border-[1.5px] border-tan bg-background text-[22px] leading-none font-semibold text-brown-dark hover:bg-brown hover:text-brown-foreground"
                >
                  −
                </button>
                <output
                  className={cn(
                    "min-w-14 text-center",
                    v === undefined ? "text-sm font-medium text-muted-foreground" : "font-display text-xl font-bold",
                  )}
                >
                  {v === undefined ? "Not set" : f.fmt(v)}
                </output>
                <button
                  type="button"
                  aria-label={`Raise ${f.label}`}
                  onClick={() => step(f.k, 1)}
                  className="size-11 rounded-full border-[1.5px] border-tan bg-background text-[22px] leading-none font-semibold text-brown-dark hover:bg-brown hover:text-brown-foreground"
                >
                  +
                </button>
              </span>
            </div>
          )
        })}
      </div>

      <button type="button" onClick={() => setValues({ ...RECOMMENDED })} className="px-1 py-2.5 font-semibold text-primary">
        Use recommended settings
      </button>

      <div className="my-4 rounded-[20px] border-[1.5px] border-border bg-card p-4" aria-live="polite">
        <div className="font-semibold">{all ? "All three settings chosen" : `${chosen} of 3 settings chosen`}</div>
        <div className="mt-1 text-[13px] text-muted-foreground">
          {all ? "Starting brings this demo tumbler online." : "Choose all three to start."}
        </div>
      </div>

      <CtaButton
        disabled={!all}
        onClick={() => bringOnline(t.id, { temp: values.temp ?? RECOMMENDED.temp, ph: values.ph ?? RECOMMENDED.ph })}
      >
        Start tumbling
      </CtaButton>
    </div>
  )
}
