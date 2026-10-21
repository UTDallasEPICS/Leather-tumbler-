"use client"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { BarChart3, CircleHelp, FileText, House, LayoutGrid, Menu, Settings, UserRound, Wifi, Wrench, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDashboard } from "@/lib/dashboard-context"
import { ThemeSwitch } from "@/components/theme-switch"

const navItems = [
  { href: "/", label: "Home", icon: House },
  { href: "/group?mode=all", label: "All tumblers", icon: LayoutGrid, match: "/group" },
  { href: "/setup", label: "Setup guide", icon: Wrench },
  { href: "/logs", label: "Logs", icon: FileText },
  { href: "/configure", label: "Configure", icon: Settings },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Connection", icon: Wifi },
  { href: "/account", label: "Account", icon: UserRound },
  { href: "/help", label: "Help", icon: CircleHelp },
]

export function MobileSidebar() {
  const pathname = usePathname()
  const { connectionStatus, logs } = useDashboard()
  const [open, setOpen] = useState(false)

  const connectionDot =
    connectionStatus === "connected"
      ? "bg-success"
      : connectionStatus === "connecting"
        ? "bg-chart-3"
        : "bg-primary"

  const isActive = (item: (typeof navItems)[number]) => pathname === (item.match ?? item.href)

  return (
    <header className="relative z-30 shrink-0 bg-background">
      <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-2.5">
        <Link href="/" aria-label="Go to home page" className="flex h-[38px] items-center gap-2.5">
          <span className="flex size-[38px] items-center justify-center overflow-hidden rounded-[10px] border border-border bg-white">
            <Image src="/icon-192.png" alt="DAVA logo" width={38} height={38} className="size-[38px] object-contain" />
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <span className="flex items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground capitalize">
            <span className={cn("size-2.5 rounded-full", connectionDot)} aria-hidden="true" />
            {connectionStatus}
          </span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="main-menu"
            className="grid size-11 place-items-center rounded-xl hover:bg-brown-tint"
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />
          <nav
            id="main-menu"
            aria-label="Main menu"
            className="absolute inset-x-3.5 top-full z-50 rounded-[18px] border-[1.5px] border-border bg-background p-2 shadow-[0_14px_30px_rgba(0,0,0,.14)]"
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-base font-medium hover:bg-brown-tint",
                  isActive(item) && "bg-brown-tint text-brown-dark",
                )}
              >
                <item.icon className="size-5 text-brown" />
                {item.label}
                {item.href === "/logs" && logs.length > 0 && (
                  <span className="ml-auto rounded-full bg-brown-tint px-2 py-0.5 text-xs text-brown-dark tabular-nums">{logs.length}</span>
                )}
              </Link>
            ))}
            <ThemeSwitch />
          </nav>
        </>
      )}
    </header>
  )
}
