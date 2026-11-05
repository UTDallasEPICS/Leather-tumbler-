"use client"
// TEMPORARY 3D concept viewer. The model itself is the standalone file public/tumbler-3d/index.html.
// To remove: delete app/model/ and public/tumbler-3d/, then the lines marked "TEMP 3D model" in
// components/desktop-sidebar.tsx, components/mobile-sidebar.tsx and components/dashboard-shell.tsx.
import { useRef } from "react"
import { Images } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageTitle, Sub } from "@/components/tumbler/parts"

export default function ModelPage() {
  const frame = useRef<HTMLIFrameElement>(null)

  // the photo + sketch dialog lives inside the model page; its own masthead button is hidden here
  const openReferences = () => frame.current?.contentDocument?.getElementById("refs-btn")?.click()

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageTitle>3D model</PageTitle>
          <Sub>Concept model of the bucket tumbler and dosing setup. Drag to orbit, scroll to zoom, and click any part for details.</Sub>
        </div>
        <Button variant="outline" onClick={openReferences}>
          <Images className="size-4" />
          Photo + sketch
        </Button>
      </div>
      <iframe
        ref={frame}
        src="/tumbler-3d/index.html"
        title="3D model of the bucket tumbler"
        className="mt-5 block h-[calc(100dvh-210px)] min-h-[520px] w-full rounded-[20px] border border-border bg-card"
      />
    </div>
  )
}
