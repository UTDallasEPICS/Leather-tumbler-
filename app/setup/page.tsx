"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

// The setup guide became runs; this keeps old links and bookmarks working.
function ToRun() {
  const router = useRouter()
  const id = useSearchParams().get("id") ?? "1"
  useEffect(() => router.replace(`/run?id=${id}`), [router, id])
  return null
}

export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <ToRun />
    </Suspense>
  )
}
