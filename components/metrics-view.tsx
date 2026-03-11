"use client"

import { Thermometer, Droplets, RotateCw, RefreshCcw, Play, Square, Zap } from "lucide-react"
import { useDashboard } from "@/lib/dashboard-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  unit: string
  icon: React.ElementType
  color: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-card-foreground tabular-nums">
                {value}
              </span>
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
          </div>
          <div className={cn("flex size-10 items-center justify-center rounded-lg", color)}>
            <Icon className="size-5 text-card-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function MetricsView() {
  const {
    status,
    progress,
    heat,
    ph,
    rpm,
    cycles,
    isRunning,
    start,
    stop,
    resetCycles,
  } = useDashboard()

  const statusColor =
    status === "Forward"
      ? "bg-primary/20 text-primary"
      : status === "Rest"
        ? "bg-chart-3/20 text-chart-3"
        : "bg-muted text-muted-foreground"

  const progressBarColor =
    status === "Forward"
      ? "[&>[data-slot=progress-indicator]]:bg-primary"
      : status === "Rest"
        ? "[&>[data-slot=progress-indicator]]:bg-chart-3"
        : ""

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Metrics</h1>
          <p className="text-sm text-muted-foreground">
            Real-time sensor monitoring dashboard
          </p>
        </div>
        <Badge className={cn("w-fit text-xs font-semibold", statusColor)} variant="outline">
          {status}
        </Badge>
      </div>

      {/* Progress Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <span>
              {status === "Disconnected"
                ? "Awaiting start"
                : status === "Forward"
                  ? "Forward Phase"
                  : "Rest Phase"}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {progress.toFixed(1)}%
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={progress} className={cn("h-3", progressBarColor)} />
          <p className="mt-2 text-xs text-muted-foreground">
            {status === "Forward"
              ? "Sensors active. Metrics updating in real-time."
              : status === "Rest"
                ? "Rest period. Metrics paused."
                : "Press Start to begin a new cycle."}
          </p>
        </CardContent>
      </Card>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Heat"
          value={heat.toFixed(1)}
          unit={"\u00B0C"}
          icon={Thermometer}
          color="bg-chart-4/20"
        />
        <MetricCard
          label="pH"
          value={ph.toFixed(2)}
          unit=""
          icon={Droplets}
          color="bg-chart-2/20"
        />
        <MetricCard
          label="RPM"
          value={rpm.toString()}
          unit="rpm"
          icon={RotateCw}
          color="bg-primary/20"
        />
        <MetricCard
          label="Cycles"
          value={cycles.toString()}
          unit=""
          icon={Zap}
          color="bg-chart-3/20"
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        {!isRunning ? (
          <Button onClick={start} className="gap-2">
            <Play className="size-4" />
            Start
          </Button>
        ) : (
          <Button onClick={stop} variant="destructive" className="gap-2 text-destructive-foreground">
            <Square className="size-4" />
            Stop
          </Button>
        )}
        <Button onClick={resetCycles} variant="outline" className="gap-2">
          <RefreshCcw className="size-4" />
          Reset Cycles
        </Button>
      </div>
    </div>
  )
}
