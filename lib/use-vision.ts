"use client"

// The Inspection page's data: the inspection server's status and photos, or the demo set in Demo Mode.

import { useCallback, useEffect, useState } from "react"
import { useDashboard } from "@/lib/dashboard-context"
import { demoInspect, demoLabel, demoRemove, demoSetThreshold, demoState } from "@/lib/vision-demo"
import { shrinkPhoto, visionApi, type Inspection, type InspectStage, type VisionStatus } from "@/lib/vision"

export type VisionConnection = "loading" | "ready" | "offline"

export interface InspectMeta {
  tumblerId: number | null
  runId: string | null
  stage: InspectStage | null
}

export function useVision() {
  const { demoMode } = useDashboard()
  const [status, setStatus] = useState<VisionStatus | null>(null)
  const [list, setList] = useState<Inspection[]>([])
  const [connection, setConnection] = useState<VisionConnection>("loading")
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (demoMode) {
      const d = demoState()
      setStatus(d.status)
      setList(d.list)
      setConnection("ready")
      setError(null)
      return
    }
    try {
      const [s, l] = await Promise.all([visionApi.status(), visionApi.inspections()])
      setStatus(s)
      setList(l)
      setConnection("ready")
      setError(null)
    } catch (e) {
      setConnection("offline")
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [demoMode])

  useEffect(() => {
    setConnection("loading")
    load()
  }, [load])

  /** A photo from the camera or files (real), or one of the demo photos by id (Demo Mode). */
  const inspect = useCallback(
    async (photo: File | string, meta: InspectMeta): Promise<Inspection> => {
      if (typeof photo === "string") {
        const i = demoInspect(photo, meta)
        await load()
        return i
      }
      const i = await visionApi.inspect(await shrinkPhoto(photo), meta)
      setList((l) => [i, ...l])
      visionApi.status().then(setStatus, () => {})
      return i
    },
    [load],
  )

  const label = useCallback(
    async (id: Inspection["id"], value: string | null) => {
      // show the answer straight away; the server copy follows
      setList((l) => l.map((i) => (i.id === id ? { ...i, label: value } : i)))
      if (demoMode) {
        demoLabel(id, value)
        return load()
      }
      try {
        await visionApi.update(id, { label: value })
      } catch (e) {
        await load()
        throw e
      }
    },
    [demoMode, load],
  )

  const setThreshold = useCallback(
    async (t: number) => {
      if (demoMode) {
        demoSetThreshold(t)
        return load()
      }
      setStatus(await visionApi.setThreshold(t))
    },
    [demoMode, load],
  )

  const remove = useCallback(
    async (id: Inspection["id"]) => {
      setList((l) => l.filter((i) => i.id !== id))
      if (demoMode) {
        demoRemove(id)
        return load()
      }
      await visionApi.remove(id)
      visionApi.status().then(setStatus, () => {})
    },
    [demoMode, load],
  )

  return { demo: demoMode, status, list, connection, error, reload: load, inspect, label, setThreshold, remove }
}
