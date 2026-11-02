import { Suspense } from "react"
import { RunView } from "@/components/run/run-view"

// useSearchParams needs a Suspense boundary in a static export.
export default function RunPage() {
  return (
    <Suspense fallback={null}>
      <RunView />
    </Suspense>
  )
}
