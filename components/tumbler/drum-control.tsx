"use client"

// Starting and stopping a drum with its safety confirmations, shared by the tumbler page and the run page.

import { useState } from "react"
import { useDashboard } from "@/lib/dashboard-context"
import { useTumblers, type TumblerInfo } from "@/lib/tumblers"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"

/** request() asks to start or stop, whichever applies; render `dialogs` somewhere in the screen. */
export function useDrumControl(t: TumblerInfo) {
  const { start, stop } = useDashboard()
  const { toggleDemo } = useTumblers()
  const [confirmStart, setConfirmStart] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [closed, setClosed] = useState(false)

  const request = () => {
    if (t.running) {
      setConfirmStop(true)
      return
    }
    setLoaded(false)
    setClosed(false)
    setConfirmStart(true)
  }
  const doStart = () => {
    setConfirmStart(false)
    if (t.isReal) void start()
    else toggleDemo(t.id)
  }
  const doStop = () => {
    setConfirmStop(false)
    if (t.isReal) void stop()
    else toggleDemo(t.id)
  }

  const dialogs = (
    <>
      <AlertDialog open={confirmStart} onOpenChange={setConfirmStart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ready to start?</AlertDialogTitle>
            <AlertDialogDescription>Check both before the drum turns.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={loaded} onCheckedChange={(v) => setLoaded(v === true)} />
              The drum is loaded and ready.
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={closed} onCheckedChange={(v) => setClosed(v === true)} />
              The lid is closed and secured.
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction disabled={!(loaded && closed)} onClick={doStart}>
              Start tumbling
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop tumbling?</AlertDialogTitle>
            <AlertDialogDescription>The drum will slow down and stop. You can start it again any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction onClick={doStop}>Stop the tumbler</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return { request, dialogs }
}
