"use client"

import { MobileSidebar } from "@/components/mobile-sidebar"

export function DashboardShell({ children }: { children: React.ReactNode }) {
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
