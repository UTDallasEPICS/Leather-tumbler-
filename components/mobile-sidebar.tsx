"use client"
//whole page for mobile sidebar and nav thingie.
import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, FileText, Settings, BarChart3, Gauge, Menu, X, Wifi } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDashboard } from "@/lib/dashboard-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const navItems = [
  { href: "/", label: "Metrics", icon: Activity },
  { href: "/logs", label: "Logs", icon: FileText },
  { href: "/configure", label: "Configure", icon: Settings },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Connection", icon: Wifi },
]

export function MobileSidebar() {
  const pathname = usePathname()
  const { status, connectionStatus, logs, cycles } = useDashboard()
  const [open, setOpen] = useState(false)

  const connectionDot =
    connectionStatus === "connected"
      ? "bg-primary"
      : connectionStatus === "connecting"
        ? "bg-chart-3"
        : "bg-destructive"

  const currentPage = navItems.find((item) => item.href === pathname)

  return (
    <div className="md:hidden shrink-0">
      {/* Fixed header bar */}
      <div className="flex items-center justify-between border-b border-border bg-sidebar px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary">
            <Gauge className="size-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-sidebar-foreground">
            {currentPage?.label ?? "SensorHub"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>

      {/* Dropdown overlay */}
      {open && (
        <>
          {/* Backdrop — closes nav on tap */}
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setOpen(false)}
          />
          {/* Nav panel */}
          <div className="fixed inset-x-0 top-0 z-50 bg-sidebar pt-[env(safe-area-inset-top)]">
            {/* Header inside panel */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex size-7 items-center justify-center rounded-md bg-primary">
                  <Gauge className="size-3.5 text-primary-foreground" />
                </div>
                <span className="text-sm font-semibold text-sidebar-foreground">
                  SensorHub
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
              >
                <X className="size-5" />
              </Button>
            </div>

            {/* Nav items */}
            <nav className="flex flex-col gap-1 p-3">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
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
                    {item.href === "/" && cycles > 0 && (
                      <span className="ml-auto rounded-full bg-chart-3/20 px-2 py-0.5 text-xs tabular-nums text-chart-3">
                        {cycles}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* Status footer */}
            <div className="border-t border-sidebar-border mx-3 px-3 py-3">
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
          </div>
        </>
      )}
    </div>
  )
}
