"use client"
//metric dash withe the big cirlce and stuff to show the temp
import type { ReactNode } from "react"
import { Droplets, Thermometer, RefreshCcw, Power, Zap } from "lucide-react"
import { useDashboard } from "@/lib/dashboard-context"
import { getSettings } from "@/lib/settings"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const CIRCUMFERENCE = 2 * Math.PI * 90 // ~565.49

export function MetricsView() {
  const {
    status,
    connectionStatus,
    heat,
    ph,
    cycles,
    config,
    isRunning,
    start,
    stop,
    resetCycles,
  } = useDashboard()

  const isDemoMode = getSettings().demoMode

  const connectionDot =
    connectionStatus === "connected"
      ? "bg-primary"
      : connectionStatus === "connecting"
        ? "bg-chart-3"
        : "bg-destructive"

  const progress = config.heatLimit > 0 ? Math.min(heat / config.heatLimit, 1) : 0
  const offset = CIRCUMFERENCE * (1 - progress)

  return (
    <div className="flex flex-col h-full">
      {/* Top metrics row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Status card */}
        <div className="flex items-center gap-2.5 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm px-4 py-3">
          <div className={cn("size-2.5 shrink-0 rounded-full", connectionDot)} />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-foreground truncate">{status}</p>
              {isDemoMode && (
                <span className="rounded-md bg-chart-2/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-chart-2">
                  Demo
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Cycles card */}
        <div className="flex items-center gap-2.5 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm px-4 py-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-chart-3/15">
            <Zap className="size-4 text-chart-3" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cycles</p>
            <p className="text-sm font-semibold tabular-nums text-foreground">{cycles}</p>
          </div>
        </div>
      </div>

      {/* Hero temperature gauge + pH bar */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <GaugeCircle
          icon={<Thermometer className="size-5 text-chart-4 mb-1" />}
          value={heat.toFixed(1)}
          unit={"°C"}
          offset={offset}
          isRunning={isRunning}
          stroke="oklch(0.55 0.2 25)"
          label="Temperature"
        />

        <div className="w-full px-4 mt-8">
          <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <Droplets className="size-4 text-blue-400" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">pH Level</span>
              <span className="ml-auto text-lg font-bold tabular-nums text-foreground">{ph.toFixed(2)}</span>
            </div>
            <div className="relative h-6 w-full rounded-full overflow-hidden">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "linear-gradient(to right, #ef4444 0%, #ef4444 28.6%, #22c55e 28.6%, #22c55e 71.4%, #3b82f6 71.4%, #3b82f6 100%)",
                }}
              />
              <div
                className="absolute top-0 h-full w-1 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.8)] transition-all duration-500"
                style={{ left: `${Math.max(0, Math.min(100, (ph / 14) * 100))}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-muted-foreground tabular-nums">
              <span>0 Acidic</span>
              <span>7 Neutral</span>
              <span>14 Alkaline</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex flex-col items-center gap-4 pb-6">
        <button
          onClick={isRunning ? stop : start}
          className={cn(
            "flex items-center justify-center w-16 h-16 rounded-full",
            "transition-all duration-300 active:scale-95",
            isRunning
              ? "bg-destructive/90 shadow-[0_0_20px_rgba(220,38,38,0.3)]"
              : "bg-card border border-border/50 shadow-[0_0_20px_rgba(34,197,94,0.15)]"
          )}
        >
          <Power
            className={cn(
              "size-7 transition-colors duration-300",
              isRunning ? "text-destructive-foreground" : "text-primary"
            )}
            strokeWidth={2}
          />
        </button>

        <Button
          onClick={resetCycles}
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground"
        >
          <RefreshCcw className="size-4" />
          Reset Cycles
        </Button>
      </div>
    </div>
  )
}

function GaugeCircle({
  icon,
  value,
  unit,
  offset,
  isRunning,
  stroke,
  label,
}: {
  icon: ReactNode
  value: string
  unit: string
  offset: number
  isRunning: boolean
  stroke: string
  label: string
}) {
  return (
    <div className="relative">
      <svg viewBox="0 0 200 200" className="h-48 w-48 md:h-56 md:w-56">
        <circle
          cx="100"
          cy="100"
          r="90"
          fill="none"
          stroke="oklch(0.22 0.005 260)"
          strokeWidth="8"
        />
        <circle
          cx="100"
          cy="100"
          r="90"
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "center",
            transition: "stroke-dashoffset 0.5s ease",
          }}
          className={cn(isRunning && "drop-shadow-[0_0_6px_oklch(0.55_0.2_25)]")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {icon}
        <span className="text-4xl font-bold tabular-nums text-foreground leading-none md:text-5xl">
          {value}
        </span>
        <span className="mt-1 text-base text-muted-foreground md:text-lg">{unit}</span>
        <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}
