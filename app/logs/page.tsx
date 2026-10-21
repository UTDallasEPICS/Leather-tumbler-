"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function LogsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/analytics")
  }, [router])

  return <Link href="/analytics" className="text-brown underline">Open Analytics &amp; logs</Link>
}
