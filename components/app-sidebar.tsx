"use client"
//this is the sidebar thats persistent on desktop view same ui elements in the sidebar in mobile view.
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, FileText, Settings, Gauge, BarChart3, Wifi, Droplets } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDashboard } from "@/lib/dashboard-context"
import { Badge } from "@/components/ui/badge"

const navItems = [
  { href: "/", label: "Metrics", icon: Activity },
  { href: "/logs", label: "Logs", icon: FileText },
  { href: "/ph-logs", label: "pH Logs", icon: Droplets },
  { href: "/configure", label: "Configure", icon: Settings },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/ph-analytics", label: "pH Analytics", icon: Droplets },
  { href: "/settings", label: "Connection", icon: Wifi },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { status, connectionStatus, logs, phLogs, cycles } = useDashboard()

  const connectionDot =
    connectionStatus === "connected"
      ? "bg-primary"
      : connectionStatus === "connecting"
        ? "bg-chart-3"
        : "bg-destructive"

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
          <Gauge className="size-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold text-sidebar-foreground">SensorHub</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
              {item.href === "/logs" && logs.length > 0 && (
                <span className="ml-auto rounded-full bg-primary/20 px-2 py-0.5 text-xs tabular-nums text-primary">
                  {logs.length}
                </span>
              )}
              {item.href === "/ph-logs" && phLogs.length > 0 && (
                <span className="ml-auto rounded-full bg-blue-500/20 px-2 py-0.5 text-xs tabular-nums text-blue-400">
                  {phLogs.length}
                </span>
              )}
              {item.href === "/" && cycles > 0 && (
                <span className="ml-auto rounded-full bg-chart-3/20 px-2 py-0.5 text-xs tabular-nums text-chart-3">
                  {cycles}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <div className={cn("size-2.5 rounded-full", connectionDot)} />
          <span className="text-xs text-sidebar-foreground/70 capitalize">{connectionStatus}</span>
          <Badge
            variant="outline"
            className="ml-auto border-sidebar-border text-sidebar-foreground/70 text-xs"
          >
            {status}
          </Badge>
        </div>
      </div>
    </aside>
  )
}
