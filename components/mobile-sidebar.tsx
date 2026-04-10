"use client"
//This is the code that handles the mobile sidebar
import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, FileText, Settings, BarChart3, Gauge, Menu, Wifi } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDashboard } from "@/lib/dashboard-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"

//all the navigation items like icons and their labels
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
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </Button>
      </div>

      {/* Left-sliding sidebar sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
          <SheetTitle className="sr-only">Navigation</SheetTitle>

          {/* Logo header — padded below notch/status bar */}
          <div className="flex items-center gap-3 px-6 py-5" style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <Gauge className="size-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-sidebar-foreground">SensorHub</span>
          </div>

          {/* Nav items */}
          <nav className="flex flex-1 flex-col gap-1 px-3 py-2 overflow-y-auto">
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

          {/* Status footer — padded above home indicator */}
          <div className="border-t border-sidebar-border px-4 py-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
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
        </SheetContent>
      </Sheet>
    </div>
  )
}
