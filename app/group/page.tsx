import { Suspense } from "react"
import { GroupView } from "@/components/tumbler/group-view"

// useSearchParams needs a Suspense boundary in a static export.
export default function GroupPage() {
  return (
    <Suspense fallback={null}>
      <GroupView />
    </Suspense>
  )
}
