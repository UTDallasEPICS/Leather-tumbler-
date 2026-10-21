"use client"

import { useMemo } from "react"
import { Activity, Droplets, Thermometer, Trash2 } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useDashboard } from "@/lib/dashboard-context"
import { PageTitle, Sub } from "@/components/tumbler/parts"
import { Button } from "@/components/ui/button"

const metrics = [
  { key: "temperature", label: "Temperature", unit: "°C", color: "var(--chart-1)", icon: Thermometer },
  { key: "ph", label: "pH level", unit: "pH", color: "var(--chart-2)", icon: Droplets },
] as const

const timeLabel = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })

export function AnalyticsView() {
  const { logs, clearLogs, isRunning } = useDashboard()
  const data = useMemo(() => [...logs].reverse().map((log) => ({
    timestamp: log.timestamp.getTime(),
    temperature: log.temperature,
    ph: log.ph,
  })), [logs])

  return (
    <div className="space-y-5">
      <div>
        <PageTitle>Analytics &amp; logs</PageTitle>
        <Sub>Tumbler 1 · Temperature and pH history in one place.</Sub>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${isRunning ? "bg-success" : "bg-muted-foreground"}`} aria-hidden="true" />
            {isRunning ? "Recording readings" : "Standby"}
          </span>
          <span>{logs.length} {logs.length === 1 ? "reading" : "readings"} collected</span>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-border bg-card px-5 py-10 text-center">
          <Activity className="size-7 text-brown" aria-hidden="true" />
          <h2 className="font-display text-xl font-bold">No readings yet</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            Start a cycle on Tumbler 1 to see temperature and pH trends, with every reading listed below.
          </p>
        </div>
      ) : (
        <section aria-label="Reading trends" className="divide-y divide-border rounded-[18px] border border-border bg-card px-3 sm:px-4">
          {metrics.map((metric) => (
            <div key={metric.key} className="py-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <metric.icon className="size-4" style={{ color: metric.color }} aria-hidden="true" />
                {metric.label}
                <span className="ml-auto text-xs font-normal text-muted-foreground">{metric.unit}</span>
              </h2>
              <div className="h-[160px] w-full sm:h-[180px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
                    <defs>
                      <linearGradient id={`history-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={metric.color} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={metric.color} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="timestamp" tickFormatter={timeLabel} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40} />
                    <YAxis width={34} domain={metric.key === "ph" ? [0, 14] : ["auto", "auto"]} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      labelFormatter={(timestamp) => new Date(Number(timestamp)).toLocaleString()}
                      formatter={(value) => [`${Number(value).toFixed(metric.key === "ph" ? 2 : 1)} ${metric.unit}`, metric.label]}
                      contentStyle={{ backgroundColor: "var(--card)", color: "var(--card-foreground)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                      labelStyle={{ color: "var(--muted-foreground)" }}
                      itemStyle={{ color: metric.color }}
                    />
                    <Area type="monotone" dataKey={metric.key} name={metric.label} stroke={metric.color} strokeWidth={2} fill={`url(#history-${metric.key})`} dot={data.length === 1 ? { r: 3 } : false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="readings-heading" className="overflow-hidden rounded-[18px] border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <div>
            <h2 id="readings-heading" className="font-display text-lg font-bold">All readings</h2>
            <p className="text-xs text-muted-foreground">Newest first · Captured during forward phase</p>
          </div>
          <Button onClick={clearLogs} variant="outline" size="sm" className="shrink-0 gap-1.5" disabled={logs.length === 0}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Clear logs
          </Button>
        </div>
        {logs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Recorded readings will appear here.</p>
        ) : (
          <div className="max-h-[320px] overflow-auto" tabIndex={0} role="region" aria-label="Recorded readings">
            <table className="w-full text-left text-xs tabular-nums sm:text-sm">
              <caption className="sr-only">Tumbler 1 temperature and pH readings, newest first</caption>
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-3 font-medium">#</th>
                  <th scope="col" className="px-2 py-3 font-medium">Time</th>
                  <th scope="col" className="px-2 py-3 text-right font-medium">Temp. (°C)</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">pH</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log, index) => (
                  <tr key={log.id} className="hover:bg-accent/50">
                    <td className="px-3 py-2.5 text-muted-foreground">{logs.length - index}</td>
                    <td className="px-2 py-2.5">
                      <time dateTime={log.timestamp.toISOString()}>
                        <span className="block whitespace-nowrap">{timeLabel(log.timestamp.getTime())}</span>
                        <span className="block text-[10px] text-muted-foreground">{log.timestamp.toLocaleDateString()}</span>
                      </time>
                    </td>
                    <td className="px-2 py-2.5 text-right font-medium">{log.temperature.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{log.ph.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
