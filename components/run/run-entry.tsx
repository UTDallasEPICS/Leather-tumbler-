"use client"

// How a tumbler's page reaches its runs: the + button, the run-in-progress card and the override.

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Cloud, CloudOff, Plus, RefreshCw, Smartphone, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { clock, extraClock, fmtWhen, mainClock, phaseOf, runProgress, stepStateOf, useNow, useRuns, type Run, type SyncStatus } from "@/lib/runs"
import type { TumblerInfo } from "@/lib/tumblers"
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

/** "Pickling · step 3 of 6: Oil and sulfuric acid" */
export function runWhere(run: Run): string {
  const ph = phaseOf(run)
  if (ph.kind === "step") return `${ph.stage.name} · step ${run.step + 1} of ${ph.stage.steps.length}: ${ph.step.title}`
  if (ph.kind === "stage-check") return `${ph.stage.name} · check the hide`
  return "Ready to take the leather out"
}

/** "Pickling 3/6", for lists. */
export function runShort(run: Run): string {
  const ph = phaseOf(run)
  if (ph.kind === "step") return `${ph.stage.name} ${run.step + 1}/${ph.stage.steps.length}`
  if (ph.kind === "stage-check") return `${ph.stage.name} check`
  return "Ready to unload"
}

/** What's counting down right now, if anything. */
function runTimer(run: Run, now: number): string | null {
  const ph = phaseOf(run)
  if (ph.kind !== "step") return null
  const s = stepStateOf(run, ph.key)
  const extra = extraClock(s, now)
  if (extra?.ticking) return `Extra running · ${clock(extra.remaining)} left`
  const main = mainClock(ph.step, s, now)
  if (main?.ticking) return `${clock(main.remaining)} left in this step`
  if (main?.finished) return "Timer done. Finish the step."
  return null
}

const SYNC: Record<SyncStatus, { text: string; Icon: typeof Cloud }> = {
  saved: { text: "Saved on the tumbler", Icon: Cloud },
  saving: { text: "Saving to the tumbler…", Icon: RefreshCw },
  waiting: { text: "Offline · changes will sync", Icon: CloudOff },
  offline: { text: "Offline · showing the last saved copy", Icon: CloudOff },
  remote: { text: "Updated on another device", Icon: Users },
  device: { text: "Saved on this device only", Icon: Smartphone },
}

/** Where the run is saved: on the tumbler, waiting to sync, or only here. Nothing for demo runs. */
export function SyncLine({ run, className }: { run: Run; className?: string }) {
  const { syncStatus } = useRuns()
  const status = syncStatus(run)
  if (!status) return null
  const { text, Icon } = SYNC[status]
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] font-medium",
        status === "waiting" || status === "offline" ? "text-primary" : "text-muted-foreground",
        className,
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", status === "saving" && "animate-spin [animation-duration:2s]")} />
      {text}
    </span>
  )
}

const REASONS = [
  "The run wasn't logged in the app",
  "Something went wrong with the batch",
  "Starting over with a different batch",
  "Other",
]

/** Ends a run early as overridden (it stays in the history but not in the suggestions), then opens a new one. */
export function OverrideDialog({ t, run, open, onOpenChange }: { t: TumblerInfo; run: Run; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { override } = useRuns()
  const router = useRouter()
  const [reason, setReason] = useState<string | null>(null)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Override run #{run.number}?</AlertDialogTitle>
          <AlertDialogDescription>
            It ends now and {t.name} is freed for a new run. It stays in the history, but suggestions won&apos;t learn from it. Why
            are you overriding it?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div role="radiogroup" aria-label="Reason" className="space-y-2">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={cn(
                "w-full rounded-xl border-[1.5px] px-3 py-2.5 text-left text-sm font-medium transition-colors",
                reason === r ? "border-brown bg-brown-tint text-brown-dark" : "border-border hover:bg-brown-tint",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep the run</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason}
            onClick={() => {
              override(t.id, reason!)
              router.push(`/run?id=${t.id}`)
            }}
          >
            Override and start new
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** The + in the corner of a tumbler's page. With a run going it explains why not, and offers the override. */
export function NewRunButton({ t }: { t: TumblerInfo }) {
  const router = useRouter()
  const { activeRun } = useRuns()
  const run = activeRun(t.id)
  const [busy, setBusy] = useState(false)
  const [overriding, setOverriding] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-label={`New run on ${t.name}`}
        title="New run"
        onClick={() => (run ? setBusy(true) : router.push(`/run?id=${t.id}`))}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:bg-red-dark active:scale-95"
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </button>
      {run && (
        <>
          <AlertDialog open={busy} onOpenChange={setBusy}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.name} already has a run going</AlertDialogTitle>
                <AlertDialogDescription>
                  Run #{run.number} is at {runWhere(run).replace(/^(.)/, (c) => c.toLowerCase())}. A new run can start once it&apos;s
                  finished and the leather is out.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <button
                type="button"
                onClick={() => {
                  setBusy(false)
                  setOverriding(true)
                }}
                className="w-fit text-sm font-semibold text-primary hover:underline"
              >
                Something went wrong? Override it and start a new run
              </button>
              <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
                <AlertDialogAction onClick={() => router.push(`/run?id=${t.id}`)}>Continue run</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <OverrideDialog t={t} run={run} open={overriding} onOpenChange={setOverriding} />
        </>
      )}
    </>
  )
}

/** Where the tumbler's run stands, linking into it. activeOnly hides the "no run" state. */
export function RunCard({ t, activeOnly = false }: { t: TumblerInfo; activeOnly?: boolean }) {
  const { activeRun, history } = useRuns()
  const run = activeRun(t.id)
  const now = useNow()

  if (!run) {
    if (activeOnly) return null
    const last = history(t.id)[0]
    return (
      <Link
        href={`/run?id=${t.id}`}
        className="mt-4 flex items-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-tan p-3.5 transition-colors hover:bg-brown-tint"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brown-tint text-brown">
          <Plus className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">No run in progress</span>
          <span className="block text-sm text-muted-foreground">
            {last
              ? `Run #${last.number} ${last.status === "overridden" ? "was overridden" : "finished"} ${fmtWhen(last.endedAt ?? last.startedAt)}. Tap + to start the next.`
              : "Tap + to start a run and follow the recipe step by step."}
          </span>
        </span>
        <ChevronRight className="size-[18px] text-muted-foreground" />
      </Link>
    )
  }

  const timer = runTimer(run, now)
  const pct = Math.round(runProgress(run) * 100)
  return (
    <Link
      href={`/run?id=${t.id}`}
      className="mt-4 block rounded-[18px] border-[1.5px] border-brown/40 bg-brown-tint p-4 transition-colors hover:border-brown"
    >
      <span className="flex items-center justify-between text-[12px] font-semibold tracking-wide text-brown uppercase">
        Run #{run.number} in progress
        <span className="tabular-nums">{pct}%</span>
      </span>
      <span className="font-display mt-1 block text-lg leading-snug font-bold">{runWhere(run)}</span>
      {timer && <span className="mt-0.5 block text-sm text-muted-foreground tabular-nums">{timer}</span>}
      <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-background">
        <i className="block h-full rounded-full bg-brown transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-brown">
          Continue run
          <ChevronRight className="size-4" />
        </span>
        <SyncLine run={run} />
      </span>
    </Link>
  )
}
