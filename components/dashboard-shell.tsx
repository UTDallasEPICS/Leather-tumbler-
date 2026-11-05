"use client"

import { Suspense } from "react"
import { usePathname } from "next/navigation"
import { useIsDesktop } from "@/hooks/use-desktop"
import { cn } from "@/lib/utils"
import { MobileSidebar } from "@/components/mobile-sidebar"
import { DesktopSidebar } from "@/components/desktop-sidebar"

const WIDE_PAGES = ["/", "/analytics", "/run", "/inspection"]

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop()
  const pathname = usePathname()

  if (isDesktop) {
    return (
      <div className="flex h-dvh overflow-hidden bg-page">
        {/* the menu reads ?id= to highlight the open tumbler; a static export needs a Suspense boundary for that */}
        <Suspense fallback={null}>
          <DesktopSidebar />
        </Suspense>
        <main className="my-2 mr-2 min-h-0 flex-1 overflow-y-auto rounded-[20px] border border-border bg-background">
          {/* the dashboard, analytics and runs spread out; the other screens keep a readable column */}
          <div className={cn("mx-auto px-8 pt-7 pb-12", WIDE_PAGES.includes(pathname) ? "max-w-6xl" : "max-w-2xl")}>{children}</div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-dvh justify-center overflow-hidden bg-page">
      {/* Phone-width column: fills a phone, sits centred on a laptop. */}
      <div className="flex min-h-0 w-full max-w-xl flex-col overflow-hidden bg-background md:shadow-[0_0_0_1px_var(--border),0_20px_50px_rgba(0,0,0,0.12)]">
        <MobileSidebar />
        <main className="relative min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-9">
          <div className="relative z-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
