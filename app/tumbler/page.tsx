import { Suspense } from "react"
import { TumblerView } from "@/components/tumbler/tumbler-view"

// useSearchParams needs a Suspense boundary in a static export.
export default function TumblerPage() {
  return (
    <Suspense fallback={null}>
      <TumblerView />
    </Suspense>
  )
}
