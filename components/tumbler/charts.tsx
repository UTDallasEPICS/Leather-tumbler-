"use client"

// Dials, tubes and sparklines for the tumbler detail screen.

import { clampPct } from "@/lib/tumblers"

const MAX_RPM = 20

export function Tube({
  label,
  value,
  fill,
  color,
}: {
  label: React.ReactNode
  value: string
  fill: number
  color: string
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-display text-[22px] font-bold tabular-nums">{value}</span>
      <div className="relative min-h-[250px] w-[34px] flex-1 overflow-hidden rounded-[17px] border-2 border-foreground bg-brown-tint">
        <i
          className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
          style={{ height: `${clampPct(fill)}%`, background: color }}
        />
      </div>
      <span className="text-center text-[13px] leading-tight font-semibold text-muted-foreground">{label}</span>
    </div>
  )
}

export function RpmGauge({ rpm }: { rpm: number | null }) {
  const f = rpm === null ? 0 : clampPct((rpm / MAX_RPM) * 100) / 100
  return (
    <div className="w-full max-w-[210px]">
      <svg viewBox="0 0 200 134" role="img" aria-label={rpm === null ? "Drum speed not measured" : `Drum speed ${rpm.toFixed(0)} rpm`}>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--brown-tint)" strokeWidth="16" strokeLinecap="round" />
        {f > 0 && (
          <path
            d="M20 100 A80 80 0 0 1 180 100"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${(f * 251.3).toFixed(1)} 252`}
            style={{ transition: "stroke-dasharray .8s ease" }}
          />
        )}
        <g style={{ transformOrigin: "100px 100px", transform: `rotate(${-90 + f * 180}deg)`, transition: "transform .8s ease" }}>
          <line x1="100" y1="100" x2="100" y2="42" stroke="var(--foreground)" strokeWidth="4" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="8" fill="var(--foreground)" />
        <text x="100" y="132" textAnchor="middle" fill="var(--foreground)" className="font-display" style={{ fontSize: 26, fontWeight: 700 }}>
          {rpm === null ? "—" : `${rpm.toFixed(0)} rpm`}
        </text>
      </svg>
      {rpm === null && <p className="-mt-1 text-xs text-muted-foreground">Speed isn&apos;t measured yet</p>}
    </div>
  )
}

/** Line chart that fits itself to the data, with a minimum span so noise doesn't look like a trend. */
export function Sparkline({ values, color, minSpan }: { values: number[]; color: string; minSpan: number }) {
  if (values.length < 2) {
    return <div className="mt-1.5 grid h-16 place-items-center text-sm text-muted-foreground">Waiting for readings…</div>
  }
  const w = 300
  const h = 64
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, minSpan)
  const lo = (max + min) / 2 - span / 2
  const pts = values.map(
    (v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - lo) / span) * (h - 8)).toFixed(1)}`,
  )
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" className="mt-1.5 block h-16 w-full">
      <polygon points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={color} opacity={0.12} />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function ChartCard({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-[18px] border-[1.5px] border-border px-4 py-3.5">
      <div className="flex items-baseline justify-between font-semibold">
        <span>{label}</span>
        <span className="font-display text-xl tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  )
}
