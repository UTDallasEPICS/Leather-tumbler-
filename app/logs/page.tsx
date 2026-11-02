"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Logs now live on the Analytics screen; this keeps old bookmarks and home-screen shortcuts working.
export default function LogsPage() {
  const router = useRouter()
  useEffect(() => router.replace("/analytics"), [router])
  return null
}
