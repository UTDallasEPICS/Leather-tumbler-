"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { MobileSidebar } from "@/components/mobile-sidebar"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background pt-[env(safe-area-inset-top)]">
      <div className="hidden md:block">
        <AppSidebar />
      </div>
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        <MobileSidebar />
        <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
