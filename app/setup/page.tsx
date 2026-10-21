import { Suspense } from "react"
import { SetupView } from "@/components/setup-view"

// useSearchParams needs a Suspense boundary in a static export.
export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupView />
    </Suspense>
  )
}
