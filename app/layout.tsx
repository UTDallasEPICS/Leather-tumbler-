//This wrapper is top level of the entire app, every page renders underneath this wrapper.
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { DashboardProvider } from '@/lib/dashboard-context'
import { DashboardShell } from '@/components/dashboard-shell'
import { ThemeProvider } from '@/components/theme-provider'
import { ServiceWorkerRegister } from '@/components/sw-register'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

//this is metadata like pwa manifests , icons etc. 
export const metadata: Metadata = {
  title: 'SensorHub - Industrial Monitoring',
  description: 'Real-time sensor monitoring dashboard for industrial processes',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.jpg',
    apple: '/icon-512.jpg',
  },
}

//This is where the viewport config is, helps for different devices example camera notch safe area
export const viewport: Viewport = {
  themeColor: '#1a1a2e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

//all the nested providers for the websokcet server we have, sensors states and the navigation of app.
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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="apple-touch-icon" href="/icon-512.jpg" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <DashboardProvider>
            <DashboardShell>
              {children}
            </DashboardShell>
          </DashboardProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
