import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { DashboardProvider } from '@/lib/dashboard-context'
import { DashboardShell } from '@/components/dashboard-shell'
import { ServiceWorkerRegister } from '@/components/sw-register'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'SensorHub - Industrial Monitoring',
  description: 'Real-time sensor monitoring dashboard for industrial processes',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.jpg',
    apple: '/icon-512.jpg',
  },
}

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#1a1a2e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-512.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="font-sans antialiased">
        <DashboardProvider>
          <DashboardShell>
            {children}
          </DashboardShell>
        </DashboardProvider>
        <ServiceWorkerRegister />
        <Analytics />
      </body>
    </html>
  )
}
