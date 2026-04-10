"use client"
//this code renders the small cards in the homepage that shows the status and demo badge and cycles count, them temp gauge, ph bar, power button and cycels button
import { Thermometer, RefreshCcw, Power, Zap, Droplets } from "lucide-react"
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
//this is conenction indicator
  const connectionDot =
    connectionStatus === "connected"
      ? "bg-primary"
      : connectionStatus === "connecting"
        ? "bg-chart-3"
        : "bg-destructive"
//this is checking for whther we hit the heat limit
  const progress = config.heatLimit > 0 ? Math.min(heat / config.heatLimit, 1) : 0
  const offset = CIRCUMFERENCE * (1 - progress)
//here we render all the cards and ui components
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

      {/* Hero temperature gauge */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative">
          <svg viewBox="0 0 200 200" className="w-56 h-56">
            {/* Background track */}
            <circle
              cx="100" cy="100" r="90"
              fill="none"
              stroke="oklch(0.22 0.005 260)"
              strokeWidth="8"
            />
            {/* Progress arc */}
            <circle
              cx="100" cy="100" r="90"
              fill="none"
              stroke="oklch(0.55 0.2 25)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: "center",
                transition: "stroke-dashoffset 0.5s ease",
              }}
              className={cn(
                isRunning && "drop-shadow-[0_0_6px_oklch(0.55_0.2_25)]"
              )}
            />
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Thermometer className="size-5 text-chart-4 mb-1" />
            <span className="text-5xl font-bold tabular-nums text-foreground leading-none">
              {heat.toFixed(1)}
            </span>
            <span className="text-lg text-muted-foreground mt-1">{"\u00B0C"}</span>
          </div>
        </div>

        {/* pH horizontal bar */}
        <div className="w-full px-4 mt-10">
          <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <Droplets className="size-4 text-blue-400" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">pH Level</span>
              <span className="ml-auto text-lg font-bold tabular-nums text-foreground">{ph.toFixed(2)}</span>
            </div>
            <div className="relative h-6 w-full rounded-full overflow-hidden">
              {/* 3-zone gradient background: red (acidic 0-4) → green (neutral 4-10) → blue (alkaline 10-14) */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "linear-gradient(to right, #ef4444 0%, #ef4444 28.6%, #22c55e 28.6%, #22c55e 71.4%, #3b82f6 71.4%, #3b82f6 100%)",
                }}
              />
              {/* Current pH indicator */}
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
