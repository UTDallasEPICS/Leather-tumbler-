"use client"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Activity, BarChart3, FileText, Grid3X3, Menu, Settings, UserRound, Wifi, X, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDashboard } from "@/lib/dashboard-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const navItems = [
  { href: "/", label: "Metrics", icon: Activity },
  { href: "/setup", label: "Setup", icon: Wrench },
  { href: "/logs", label: "Logs", icon: FileText },
  { href: "/configure", label: "Configure", icon: Settings },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Connection", icon: Wifi },
  { href: "/account", label: "Account", icon: UserRound },
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
    <header className="shrink-0 border-b border-border bg-sidebar">
      <div className="flex items-center justify-between px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex items-center gap-3">
          <div className="flex size-7 items-center justify-center overflow-hidden rounded-md border border-sidebar-border bg-white">
            <Image src="/icon-192.png" alt="DAVA logo" width={28} height={28} className="size-7 object-contain" />
          </div>
          <span className="text-sm font-semibold text-sidebar-foreground md:text-base">
            {currentPage?.label ?? "DAVA"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("size-2.5 rounded-full", connectionDot)} />
          <Badge
            variant="outline"
            className="border-sidebar-border text-sidebar-foreground/70 text-[10px] uppercase tracking-wide"
          >
            {status}
          </Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation"
            className="text-sidebar-foreground"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-0 top-0 z-50 bg-sidebar pt-[env(safe-area-inset-top)] shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex size-7 items-center justify-center overflow-hidden rounded-md border border-sidebar-border bg-white">
                  <Image src="/icon-192.png" alt="DAVA logo" width={28} height={28} className="size-7 object-contain" />
                </div>
                <span className="text-sm font-semibold text-sidebar-foreground">
                  App Launcher
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
            <nav className="p-4">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-sidebar-foreground/60">
                <Grid3X3 className="size-3.5" />
                Quick Navigation
              </div>
              <div className="grid grid-cols-3 gap-3">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-sidebar-border px-2 py-3 text-center transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "bg-sidebar text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon className="size-5" />
                    <span className="text-xs font-medium">{item.label}</span>
                    {item.href === "/logs" && logs.length > 0 && (
                      <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] tabular-nums text-primary">
                        {logs.length}
                      </span>
                    )}
                    {item.href === "/" && cycles > 0 && (
                      <span className="rounded-full bg-chart-3/20 px-2 py-0.5 text-[10px] tabular-nums text-chart-3">
                        {cycles}
                      </span>
                    )}
                  </Link>
                )
              })}
              </div>
            </nav>

            <div className="mx-3 border-t border-sidebar-border px-3 py-3">
              <div className="flex items-center gap-2">
                <div className={cn("size-2.5 rounded-full", connectionDot)} />
                <span className="text-xs capitalize text-sidebar-foreground/70">{connectionStatus}</span>
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
    </header>
  )
}
