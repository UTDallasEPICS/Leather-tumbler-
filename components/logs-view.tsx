"use client"
//log page with table of temp logs and readings.
import { FlaskConical, Trash2, Thermometer } from "lucide-react"
import { useDashboard } from "@/lib/dashboard-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

export function LogsView() {
  const { logs, clearLogs } = useDashboard()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Logs</h1>
          <p className="text-sm text-muted-foreground">
            Temperature and pH readings captured during Forward phase
          </p>
        </div>
        <Button
          onClick={clearLogs}
          variant="outline"
          size="sm"
          className="w-fit gap-2"
          disabled={logs.length === 0}
        >
          <Trash2 className="size-4" />
          Clear Logs
        </Button>
      </div>

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="text-sm">
            <div className="grid grid-cols-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span>#</span>
              <span>Timestamp</span>
              <span className="text-right">Temperature</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Thermometer className="size-8 opacity-40" />
              <p className="text-sm">No logs recorded yet.</p>
              <p className="text-xs">Start a cycle to begin capturing temperature data.</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="divide-y divide-border">
                {logs.map((log, index) => (
                  <div
                    key={log.id}
                    className="grid grid-cols-3 items-center px-6 py-3 text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="tabular-nums text-muted-foreground">
                      {logs.length - index}
                    </span>
                    <span className="tabular-nums text-foreground">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span className="tabular-nums text-right font-medium text-foreground">
                      {log.temperature.toFixed(1)}{"\u00B0C"}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="text-sm">
            <div className="grid grid-cols-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span>#</span>
              <span>Timestamp</span>
              <span className="text-right">pH</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <FlaskConical className="size-8 opacity-40" />
              <p className="text-sm">No pH logs recorded yet.</p>
              <p className="text-xs">Start a cycle to begin capturing pH data.</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="divide-y divide-border">
                {logs.map((log, index) => (
                  <div
                    key={`${log.id}-ph`}
                    className="grid grid-cols-3 items-center px-6 py-3 text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="tabular-nums text-muted-foreground">
                      {logs.length - index}
                    </span>
                    <span className="tabular-nums text-foreground">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span className="tabular-nums text-right font-medium text-foreground">
                      {log.ph.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
