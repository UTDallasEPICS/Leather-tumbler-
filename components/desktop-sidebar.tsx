"use client"
// Left-hand menu for the desktop layout. Full width with labels, or a compact icon rail (Ctrl+B or the panel button).
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import {
  BarChart3,
  ChevronDown,
  CircleHelp,
  House,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserRound,
  Wifi,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { eventLevel } from "@/lib/analytics"
import { useDashboard } from "@/lib/dashboard-context"
import { useTumblers, type TumblerInfo } from "@/lib/tumblers"
import { THEME_OPTIONS, ThemeSwitch } from "@/components/theme-switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type NavItem = { href: string; label: string; icon: LucideIcon; match?: string }

const mainItems: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/group?mode=all", label: "All tumblers", icon: LayoutGrid, match: "/group" },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
]

const settingsItems: NavItem[] = [
  { href: "/configure", label: "Configure", icon: Settings },
  { href: "/settings", label: "Connection", icon: Wifi },
  { href: "/account", label: "Account", icon: UserRound },
  { href: "/help", label: "Help", icon: CircleHelp },
]

const STORAGE_KEY = "sensorhub-sidebar"

// Only runs in the browser: the shell renders nothing until it has mounted.
function initialCompact() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return saved === "compact"
  } catch {}
  // no choice saved yet: smaller laptop screens start compact so the tumblers get the room
  return !window.matchMedia("(min-width: 1280px)").matches
}

/** Tooltip to the right of a compact-menu icon. */
function Hint({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

const rowBase = "flex h-10 items-center gap-3 rounded-xl px-3 whitespace-nowrap transition-colors hover:bg-brown-tint"

function NavLink({ item, active, compact, badge }: { item: NavItem; active: boolean; compact: boolean; badge?: number }) {
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? item.label : undefined}
      className={cn(rowBase, "text-[15px] font-medium", compact && "justify-center px-0", active && "bg-brown-tint text-brown-dark")}
    >
      <item.icon className="size-5 shrink-0 text-brown" />
      {!compact && <span className="truncate">{item.label}</span>}
      {!compact && !!badge && (
        <span className="ml-auto rounded-full bg-brown/15 px-2 py-0.5 text-xs text-brown-dark tabular-nums">{badge}</span>
      )}
    </Link>
  )
  return compact ? <Hint label={item.label}>{link}</Hint> : link
}

function TumblerLink({ t, active, compact }: { t: TumblerInfo; active: boolean; compact: boolean }) {
  const status = !t.online ? "Offline" : t.running ? "Running" : "Ready"
  const link = (
    <Link
      href={`/tumbler?id=${t.id}`}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? `${t.name}, ${status}` : undefined}
      className={cn(rowBase, compact && "justify-center px-0", active && "bg-brown-tint text-brown-dark")}
    >
      <span
        className={cn(
          "relative grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-brown tabular-nums",
          active ? "bg-background" : "bg-brown-tint",
        )}
      >
        {t.id}
        <span
          aria-hidden="true"
          className={cn("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-page", t.online ? "bg-success" : "bg-primary")}
        />
      </span>
      {!compact && (
        <>
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{t.name}</span>
          <span className={cn("text-xs", t.running ? "font-semibold text-success" : "text-muted-foreground")}>{status}</span>
        </>
      )}
    </Link>
  )
  return compact ? <Hint label={`${t.name} · ${status}`}>{link}</Hint> : link
}

/** A titled group of links; the title folds it away. In the compact rail it is just a divider. */
function Section({ title, compact, children }: { title: string; compact: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  if (compact) return <div className="mt-3 space-y-0.5 border-t border-border pt-3">{children}</div>
  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
      >
        {title}
        <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  )
}

/** One button that steps Light → Dark → Auto, for the compact rail. */
function ThemeCycleButton() {
  const { theme, setTheme } = useTheme()
  const i = Math.max(0, THEME_OPTIONS.findIndex((o) => o.value === (theme ?? "system")))
  const current = THEME_OPTIONS[i]
  const next = THEME_OPTIONS[(i + 1) % THEME_OPTIONS.length]
  return (
    <Hint label={`Appearance: ${current.label}`}>
      <button
        type="button"
        onClick={() => setTheme(next.value)}
        aria-label={`Appearance: ${current.label}. Switch to ${next.label}`}
        className="grid size-10 place-items-center rounded-xl text-brown hover:bg-brown-tint"
      >
        <current.icon className="size-5" />
      </button>
    </Hint>
  )
}

export function DesktopSidebar() {
  const pathname = usePathname()
  const params = useSearchParams()
  const { connectionStatus, notificationLogs, demoMode } = useDashboard()
  const alerts = notificationLogs.filter((e) => eventLevel(e) !== "ok").length
  const { tumblers } = useTumblers()
  const [compact, setCompact] = useState(initialCompact)

  // remember the choice only once the user has made one, so the width-based default keeps working until then
  const chosen = useRef(false)
  useEffect(() => {
    if (!chosen.current) return
    try {
      localStorage.setItem(STORAGE_KEY, compact ? "compact" : "full")
    } catch {}
  }, [compact])

  const toggle = useCallback(() => {
    chosen.current = true
    setCompact((c) => !c)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggle])

  const isActive = (item: NavItem) => pathname === (item.match ?? item.href)
  const openTumbler = pathname === "/tumbler" ? Number(params.get("id") ?? 1) : null

  const connectionDot =
    connectionStatus === "connected" ? "bg-success" : connectionStatus === "connecting" ? "bg-chart-3" : "bg-primary"
  const toggleLabel = compact ? "Expand menu (Ctrl+B)" : "Collapse menu (Ctrl+B)"

  return (
    <aside
      aria-label="Main menu"
      className={cn(
        "flex h-dvh shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-out",
        compact ? "w-[72px]" : "w-64",
      )}
    >
      <div className={cn("flex items-center gap-2 px-3 pt-4 pb-3", compact && "flex-col")}>
        <Link
          href="/"
          aria-label="Go to home page"
          className={cn("flex min-w-0 items-center gap-2.5 rounded-xl p-1", !compact && "flex-1")}
        >
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-white">
            <Image src="/icon-192.png" alt="" width={36} height={36} className="size-9 object-contain" />
          </span>
          {!compact && <span className="font-display truncate text-lg font-bold">DAVA Tumbler</span>}
        </Link>
        <Hint label={toggleLabel}>
          <button
            type="button"
            onClick={toggle}
            aria-label={toggleLabel}
            aria-expanded={!compact}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-brown-tint hover:text-foreground"
          >
            {compact ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </button>
        </Hint>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div className="space-y-0.5">
          {mainItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item)}
              compact={compact}
              badge={item.href === "/analytics" ? alerts : undefined}
            />
          ))}
        </div>

        <Section title="Tumblers" compact={compact}>
          {tumblers.map((t) => (
            <TumblerLink key={t.id} t={t} active={openTumbler === t.id} compact={compact} />
          ))}
        </Section>

        <Section title="Settings" compact={compact}>
          {settingsItems.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item)} compact={compact} />
          ))}
        </Section>
      </nav>

      {compact ? (
        <div className="flex flex-col items-center gap-1 border-t border-border px-3 py-3">
          <ThemeCycleButton />
          <Hint label={demoMode ? `${connectionStatus} · demo mode` : connectionStatus}>
            <span className="grid size-10 place-items-center" role="img" aria-label={`Connection: ${connectionStatus}`}>
              <span className={cn("size-2.5 rounded-full", connectionDot)} />
            </span>
          </Hint>
        </div>
      ) : (
        <div className="px-3 pb-3">
          <ThemeSwitch />
          <div className="mt-2 flex items-center gap-2 px-2 text-sm font-medium text-muted-foreground capitalize">
            <span className={cn("size-2.5 rounded-full", connectionDot)} aria-hidden="true" />
            {connectionStatus}
            {demoMode && (
              <span className="ml-auto rounded-md bg-chart-3/25 px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-brown-dark uppercase">
                Demo
              </span>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
