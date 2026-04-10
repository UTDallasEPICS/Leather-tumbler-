"use client"
//provides layout of the sidebar, does the fade animation i added and also the PWA notch thing which i kept seeing on my Iphone.

import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { MobileSidebar } from "@/components/mobile-sidebar"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-dvh overflow-hidden bg-background pt-[env(safe-area-inset-top)]">
      <div className="hidden md:block">
        <AppSidebar />
      </div>
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        <MobileSidebar />
        <main key={pathname} className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-3 duration-200">
          {children}
        </main>
      </div>
    </div>
  )
}
