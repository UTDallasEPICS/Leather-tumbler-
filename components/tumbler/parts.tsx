"use client"

// Small building blocks shared by the tumbler screens (home, group, detail, setup, help).

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { clampPct, type TumblerInfo } from "@/lib/tumblers"

export function DrumIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="12" cy="12" rx="8" ry="8" />
      <path d="M12 4a4 8 0 0 1 0 16M4 12h16" />
    </svg>
  )
}

export function StatusDot({ online }: { online: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "size-3 shrink-0 rounded-full",
          online ? "bg-success shadow-[0_0_0_4px_rgba(46,158,91,.18)]" : "bg-primary shadow-[0_0_0_4px_rgba(210,47,47,.16)]",
        )}
      />
      <span className="sr-only">{online ? "Online" : "Offline"}</span>
    </>
  )
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-0.5 mb-2.5 -ml-1.5 inline-flex items-center gap-1 rounded-[10px] px-2.5 py-2 font-semibold text-brown hover:bg-brown-tint"
    >
      <ChevronLeft className="size-[18px]" />
      {children}
    </Link>
  )
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="font-display text-[30px] leading-[1.1] font-bold tracking-tight">{children}</h1>
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("font-display mt-[26px] mb-3 text-xl font-bold", className)}>{children}</h2>
}

export function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-base leading-snug text-muted-foreground">{children}</p>
}

const ctaBase =
  "w-full rounded-[18px] px-4 py-[18px] text-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-border disabled:text-muted-foreground disabled:border-transparent"

export function CtaButton({
  variant = "solid",
  className,
  ...props
}: React.ComponentProps<"button"> & { variant?: "solid" | "ghost" }) {
  return (
    <button
      type="button"
      className={cn(
        ctaBase,
        variant === "solid"
          ? "bg-primary text-primary-foreground hover:bg-red-dark"
          : "border-2 border-primary bg-white text-primary hover:bg-red-tint",
        className,
      )}
      {...props}
    />
  )
}

/** One tumbler in a list: avatar, name, a line of detail, optional meter and value. */
export function TumblerRow({
  t,
  meta,
  value,
  bar,
  chevron = false,
}: {
  t: TumblerInfo
  meta: string
  value?: string
  bar?: { pct: number; color: string }
  chevron?: boolean
}) {
  return (
    <Link
      href={`/tumbler?id=${t.id}`}
      className="mb-2.5 flex w-full items-center gap-3.5 rounded-[18px] border-[1.5px] border-border bg-card p-3.5 text-left transition-colors hover:border-brown hover:bg-brown-tint"
    >
      <span className="grid size-[46px] shrink-0 place-items-center rounded-full bg-brown-tint text-brown">
        <DrumIcon className="size-[26px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold">{t.name}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{meta}</span>
        {bar && (
          <span className="mt-2 block h-1.5 overflow-hidden rounded-[3px] bg-border">
            <i className="block h-full rounded-[3px]" style={{ width: `${clampPct(bar.pct)}%`, background: bar.color }} />
          </span>
        )}
      </span>
      {value && <span className="font-display text-[26px] font-bold tracking-tight tabular-nums">{value}</span>}
      <StatusDot online={t.online} />
      {chevron && <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" />}
    </Link>
  )
}
