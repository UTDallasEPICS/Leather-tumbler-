"use client"

// The step a run is on (what to add, how long to run, what to check), the end-of-stage checks and unloading.

import { useState } from "react"
import { Check, OctagonAlert, Pause, Play, RotateCcw, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { EXTRA_RUN_MINUTES, RECIPE, amountOf, fillTime, formatAmount, type Action, type RecipeStep } from "@/lib/recipe"
import {
  clock,
  cycleAt,
  extraClock,
  fmtMinutes,
  inTarget,
  mainClock,
  phaseOf,
  readiness,
  stepStateOf,
  useRunActions,
  type Quality,
  type Run,
  type StepState,
} from "@/lib/runs"
import { checkContext } from "@/lib/run-insights"
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
import { CtaButton } from "@/components/tumbler/parts"

type Actions = ReturnType<typeof useRunActions>
type Measure = Extract<Action, { kind: "measure" }>
type Confirm = Extract<Action, { kind: "confirm" }>
type Intermittent = Extract<Action, { kind: "intermittent" }>

const label = "text-[12px] font-semibold tracking-wide text-muted-foreground uppercase"
const card = "rounded-[22px] border-[1.5px] border-border p-4"

/** A big tappable row with a round tick, for products, tasks and checks. */
export function CheckRow({
  checked,
  onToggle,
  children,
  sub,
  aside,
}: {
  checked: boolean
  onToggle: () => void
  children: React.ReactNode
  sub?: string
  aside?: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left transition-colors",
        checked ? "bg-success/10" : "bg-brown-tint hover:bg-brown-tint/70",
      )}
    >
      <span
        className={cn(
          "grid size-[26px] shrink-0 place-items-center rounded-full border-2",
          checked ? "border-success bg-success text-white" : "border-tan text-transparent",
        )}
      >
        <Check className="size-3.5" strokeWidth={3.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[16px] font-semibold", checked && "text-muted-foreground")}>{children}</span>
        {sub && <span className="mt-0.5 block text-[13px] leading-tight text-muted-foreground">{sub}</span>}
      </span>
      {aside}
    </button>
  )
}

function TimerButtons({ ticking, started, onStart, onPause, onReset }: { ticking: boolean; started: boolean; onStart: () => void; onPause: () => void; onReset?: () => void }) {
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <CtaButton className="flex w-auto items-center gap-2 px-7 py-3 text-base" onClick={ticking ? onPause : onStart}>
        {ticking ? <Pause className="size-4" /> : <Play className="size-4" />}
        {ticking ? "Pause" : started ? "Resume" : "Start timer"}
      </CtaButton>
      {started && onReset && (
        <button type="button" onClick={onReset} aria-label="Reset timer" className="grid size-11 place-items-center rounded-full text-brown hover:bg-background">
          <RotateCcw className="size-5" />
        </button>
      )}
    </div>
  )
}

function Countdown({ step, s, k, act, now }: { step: RecipeStep; s: StepState; k: string; act: Actions; now: number }) {
  const a = step.action as Extract<Action, { kind: "run" | "rest" }>
  const c = mainClock(step, s, now)!
  return (
    <div className={cn("mt-4 rounded-[18px] p-4 text-center", c.ticking && a.kind === "run" ? "bg-red-tint" : "bg-brown-tint")}>
      <div className={label}>{a.kind === "run" ? "Run the drum" : "Rest · drum stopped"}</div>
      <div className="font-display mt-1 text-[44px] leading-none font-bold tracking-tight tabular-nums">
        {c.finished ? "Done" : clock(c.remaining)}
      </div>
      <div className="mt-1 text-[13px] text-muted-foreground">
        {fmtMinutes(c.durationMs / 60_000)}
        {c.finished ? " · finished" : c.ticking ? " · counting down" : s.timer ? " · paused" : ""}
      </div>
      {a.kind === "run" && a.minutes.length > 1 && !s.timer && (
        <div className="mt-3 flex justify-center gap-2">
          {a.minutes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => act.chooseMinutes(k, m)}
              className={cn(
                "rounded-full border-[1.5px] px-4 py-1.5 text-sm font-semibold transition-colors",
                c.durationMs === m * 60_000 ? "border-brown bg-brown text-brown-foreground" : "border-tan bg-background hover:bg-background/70",
              )}
            >
              {m} min
            </button>
          ))}
        </div>
      )}
      {!c.finished && (
        <TimerButtons
          ticking={c.ticking}
          started={!!s.timer}
          onStart={() => act.startTimer(k)}
          onPause={() => act.pauseTimer(k)}
          onReset={() => act.resetTimer(k)}
        />
      )}
    </div>
  )
}

function IntermittentRuns({ step, s, k, act, now }: { step: RecipeStep; s: StepState; k: string; act: Actions; now: number }) {
  const a = step.action as Intermittent
  const c = mainClock(step, s, now)!
  const cy = cycleAt(a, c.elapsed)
  const runNow = c.ticking && cy.phase === "run"
  return (
    <div className={cn("mt-4 rounded-[18px] p-4 text-center", runNow ? "bg-red-tint" : "bg-brown-tint")}>
      <div className={label}>
        {a.runMinutes} min every {fmtMinutes(a.everyMinutes)}, for {a.hours} h
      </div>
      {c.finished ? (
        <>
          <div className="font-display mt-1 text-[44px] leading-none font-bold">Done</div>
          <div className="mt-1 text-[13px] text-muted-foreground">All {cy.count} runs finished</div>
        </>
      ) : !s.timer ? (
        <>
          <div className="font-display mt-1 text-2xl font-bold">
            {cy.count} runs of {a.runMinutes} min
          </div>
          <div className="mt-1 text-[13px] text-muted-foreground">Start the timer as the drum starts its first run.</div>
        </>
      ) : (
        <>
          <div className={cn("font-display mt-1 text-2xl font-bold", runNow && "text-primary")}>
            {cy.phase === "run" ? "Run the drum now" : "Drum resting"}
          </div>
          <div className="font-display mt-1 text-[44px] leading-none font-bold tracking-tight tabular-nums">{clock(cy.phaseRemaining)}</div>
          <div className="mt-1 text-[13px] text-muted-foreground">
            {cy.phase === "run"
              ? `left in run ${cy.index + 1} of ${cy.count}`
              : cy.index + 1 < cy.count
                ? `until run ${cy.index + 2} of ${cy.count}`
                : "until the end"}
          </div>
          <div className="mx-auto mt-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-background">
            <i className="block h-full rounded-full bg-brown" style={{ width: `${(c.elapsed / c.durationMs) * 100}%` }} />
          </div>
          <div className="mt-1.5 text-[13px] text-muted-foreground">
            {fmtMinutes(c.remaining / 60_000)} left in total{!c.ticking && " · paused"}
          </div>
        </>
      )}
      {!c.finished && (
        <TimerButtons ticking={c.ticking} started={!!s.timer} onStart={() => act.startTimer(k)} onPause={() => act.pauseTimer(k)} />
      )}
    </div>
  )
}

/** More running after a check came in short. */
function ExtraRun({ s, k, act, now }: { s: StepState; k: string; act: Actions; now: number }) {
  const c = extraClock(s, now)
  if (!c || !s.extra) return null
  if (c.finished && !s.recheck) return null
  return (
    <div className={cn("mt-3 flex items-center gap-3 rounded-[16px] p-3", c.finished ? "bg-success/10" : "bg-red-tint")}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{c.finished ? "Extra running done. Check again." : `Running ${s.extra.minutes} more minutes`}</div>
        <div className="text-[13px] text-muted-foreground tabular-nums">
          {c.finished ? `${s.extraTotalMin} min extra so far` : `${clock(c.remaining)} left${c.ticking ? "" : " · paused"}`}
        </div>
      </div>
      {!c.finished && (
        <button
          type="button"
          onClick={() => (c.ticking ? act.pauseExtra(k) : act.resumeExtra(k))}
          aria-label={c.ticking ? "Pause extra running" : "Resume extra running"}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-brown"
        >
          {c.ticking ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
      )}
    </div>
  )
}

function Missed({ k, act, what }: { k: string; act: Actions; what: string }) {
  return (
    <div className="mt-3 rounded-[16px] bg-chart-3/20 p-3">
      <p className="flex gap-2 text-sm font-semibold text-brown-dark">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        {what}
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => act.startExtra(k, EXTRA_RUN_MINUTES)}
          className="rounded-xl bg-brown px-3 py-2.5 text-sm font-semibold text-brown-foreground"
        >
          Run {EXTRA_RUN_MINUTES} more min
        </button>
        <button
          type="button"
          onClick={() => act.accept(k)}
          className="rounded-xl border-[1.5px] border-tan bg-background px-3 py-2.5 text-sm font-semibold"
        >
          Continue anyway
        </button>
      </div>
    </div>
  )
}

function MeasureCheck({ step, s, k, act, now, t, context }: { step: RecipeStep; s: StepState; k: string; act: Actions; now: number; t: TumblerInfo; context: string | null }) {
  const a = step.action as Measure
  const [text, setText] = useState("")
  const value = Number(text.replace(",", "."))
  const valid = text.trim() !== "" && Number.isFinite(value)
  const last = s.measured.at(-1)
  const extra = extraClock(s, now)
  const extraRunning = !!extra && !extra.finished
  const sensor = a.sensor === "ph" && t.ph !== null ? t.ph : null
  const save = (v: number) => {
    act.measure(k, Math.round(v * 100) / 100)
    setText("")
  }
  const [lo, hi] = a.target

  return (
    <div className="mt-4 rounded-[18px] bg-brown-tint p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-semibold">{a.label}</div>
        <div className="text-sm text-muted-foreground">
          Target {lo}–{hi} {a.unit}
        </div>
      </div>
      {s.measured.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Readings so far">
          {s.measured.map((v, i) => (
            <span
              key={i}
              className={cn(
                "rounded-lg px-2 py-1 text-sm font-semibold tabular-nums",
                inTarget(v, a.target) ? "bg-success/15 text-success" : "bg-chart-3/25 text-brown-dark",
              )}
            >
              {v}
            </span>
          ))}
        </div>
      )}
      {!extraRunning && (
        <div className="mt-3 flex gap-2">
          <input
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) save(value)
            }}
            aria-label={`${a.label} reading`}
            placeholder={last === undefined ? "Enter reading" : "New reading"}
            className="font-display h-12 min-w-0 flex-1 rounded-xl border-[1.5px] border-tan bg-background px-3 text-lg font-bold tabular-nums placeholder:font-sans placeholder:text-base placeholder:font-normal"
          />
          <button
            type="button"
            disabled={!valid}
            onClick={() => save(value)}
            className="rounded-xl bg-brown px-5 font-semibold text-brown-foreground disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}
      {sensor !== null && !extraRunning && (
        <button type="button" onClick={() => save(sensor)} className="mt-2 text-sm font-semibold text-brown">
          Use the drum&apos;s pH sensor: {sensor.toFixed(2)}
        </button>
      )}
      {a.hint && <p className="mt-2 text-[13px] text-muted-foreground">{a.hint}</p>}
      {context && <p className="mt-1.5 text-[13px] text-muted-foreground">{context}</p>}

      {last !== undefined && inTarget(last, a.target) && (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-success">
          <Check className="size-4" strokeWidth={3} />
          In range
        </p>
      )}
      {last !== undefined && !inTarget(last, a.target) && !s.accepted && !s.recheck && (
        <Missed k={k} act={act} what={`${last} is ${last < lo ? "below" : "above"} the ${lo}–${hi} target.`} />
      )}
      {last !== undefined && !inTarget(last, a.target) && s.accepted && (
        <p className="mt-3 text-sm text-muted-foreground">Continuing at {last}, off target. This is noted on the run.</p>
      )}
      <ExtraRun s={s} k={k} act={act} now={now} />
    </div>
  )
}

function ConfirmCheck({ step, s, k, act, now, context }: { step: RecipeStep; s: StepState; k: string; act: Actions; now: number; context: string | null }) {
  const a = step.action as Confirm
  const extra = extraClock(s, now)
  const extraRunning = !!extra && !extra.finished
  const answered = s.recheck ? undefined : s.confirmed
  return (
    <div className="mt-4 rounded-[18px] bg-brown-tint p-4">
      <div className="font-semibold">{a.question}</div>
      {a.hint && <p className="mt-1 text-[13px] text-muted-foreground">{a.hint}</p>}
      {context && <p className="mt-1 text-[13px] text-muted-foreground">{context}</p>}
      {!extraRunning && (
        <div role="radiogroup" aria-label={a.question} className="mt-3 grid grid-cols-2 gap-2">
          {[true, false].map((yes) => (
            <button
              key={String(yes)}
              type="button"
              role="radio"
              aria-checked={answered === yes}
              onClick={() => act.answer(k, yes)}
              className={cn(
                "rounded-xl border-[1.5px] py-3 font-semibold transition-colors",
                answered === yes
                  ? yes
                    ? "border-success bg-success text-white"
                    : "border-brown bg-brown text-brown-foreground"
                  : "border-tan bg-background hover:bg-background/70",
              )}
            >
              {yes ? "Yes" : "Not yet"}
            </button>
          ))}
        </div>
      )}
      {answered === false && !s.accepted && <Missed k={k} act={act} what="Not there yet. Run a little longer and check again." />}
      {answered === false && s.accepted && <p className="mt-3 text-sm text-muted-foreground">Continuing without a pass. This is noted on the run.</p>}
      <ExtraRun s={s} k={k} act={act} now={now} />
    </div>
  )
}

/** The hint under a disabled "Step done" button. */
function whatsLeft(step: RecipeStep, s: StepState, now: number): string | null {
  if ((step.adds ?? []).some((_, i) => !s.added[i])) return "Tick off each product as it goes in."
  const extra = extraClock(s, now)
  if (extra && !extra.finished) return "Check again once the extra running is done."
  const a = step.action
  if (a?.kind === "measure") {
    const last = s.measured.at(-1)
    if (last === undefined || s.recheck) return "Save a reading to continue."
    if (!inTarget(last, a.target) && !s.accepted) return "Run a little more, or continue anyway."
  }
  if (a?.kind === "confirm" && (s.confirmed === undefined || s.recheck)) return "Answer the check to continue."
  if (a?.kind === "confirm" && s.confirmed === false && !s.accepted) return "Run a little more, or continue anyway."
  if ((step.tasks ?? []).some((_, i) => !s.tasks[i])) return "Tick off each task when it's done."
  return null
}

export function StepCard({ run, t, history, now }: { run: Run; t: TumblerInfo; history: Run[]; now: number }) {
  const ph = phaseOf(run)
  const act = useRunActions(run)
  const [askEarly, setAskEarly] = useState(false)
  if (ph.kind !== "step") return null
  const { stage, step, key: k } = ph
  const s = stepStateOf(run, k)
  const ready = readiness(step, s, now)
  const a = step.action
  const lastInStage = run.step === stage.steps.length - 1
  const main = mainClock(step, s, now)
  const context = a?.kind === "measure" || a?.kind === "confirm" ? checkContext(history, a.key, t.name) : null

  return (
    <section className={cn(card, "mt-4")} aria-labelledby="step-title">
      <div className={label}>
        Step {run.step + 1} of {stage.steps.length}
      </div>
      <h2 id="step-title" className="font-display mt-1 text-2xl leading-tight font-bold">
        {step.title}
      </h2>

      {step.caution && (
        <p className="mt-3 flex gap-2 rounded-[16px] bg-red-tint p-3 text-sm font-medium text-primary">
          <OctagonAlert className="mt-0.5 size-4 shrink-0" />
          {step.caution}
        </p>
      )}

      {step.adds && (
        <div className="mt-4">
          <div className={label}>Add to the drum</div>
          <div className="mt-2 space-y-2">
            {step.adds.map((add, i) => {
              const amount = amountOf(add, run.hideWeightKg)
              return (
                <CheckRow
                  key={i}
                  checked={!!s.added[i]}
                  onToggle={() => act.toggleAdded(k, i)}
                  sub={`${add.pct}% of hide weight${add.unit === "L" ? ` · ${fillTime(amount)}` : ""}`}
                  aside={<b className="font-display shrink-0 text-xl tabular-nums">{formatAmount(amount, add.unit)}</b>}
                >
                  {add.product}
                </CheckRow>
              )
            })}
          </div>
        </div>
      )}

      {(a?.kind === "run" || a?.kind === "rest") && <Countdown step={step} s={s} k={k} act={act} now={now} />}
      {a?.kind === "intermittent" && <IntermittentRuns step={step} s={s} k={k} act={act} now={now} />}
      {a?.kind === "measure" && <MeasureCheck step={step} s={s} k={k} act={act} now={now} t={t} context={context} />}
      {a?.kind === "confirm" && <ConfirmCheck step={step} s={s} k={k} act={act} now={now} context={context} />}

      {step.tasks && (
        <div className="mt-4">
          <div className={label}>{step.adds || a ? "Then" : "To do"}</div>
          <div className="mt-2 space-y-2">
            {step.tasks.map((task, i) => (
              <CheckRow key={task} checked={!!s.tasks[i]} onToggle={() => act.toggleTask(k, i)}>
                {task}
              </CheckRow>
            ))}
          </div>
        </div>
      )}

      {step.note && <p className="mt-3 text-[13px] text-muted-foreground">{step.note}</p>}

      <CtaButton className="mt-5" disabled={!ready.ready} onClick={() => act.next()}>
        {lastInStage ? `Finish ${stage.name.toLowerCase()}` : "Step done"}
      </CtaButton>
      {ready.onlyTimeLeft ? (
        <button
          type="button"
          onClick={() => setAskEarly(true)}
          className="mt-2 w-full rounded-[14px] py-2.5 text-sm font-semibold text-brown hover:bg-brown-tint"
        >
          Already done? Finish this step early
        </button>
      ) : (
        !ready.ready && <p className="mt-2 text-center text-[13px] text-muted-foreground">{whatsLeft(step, s, now)}</p>
      )}

      <AlertDialog open={askEarly} onOpenChange={setAskEarly}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish {step.title.toLowerCase()} early?</AlertDialogTitle>
            <AlertDialogDescription>
              {main && main.remaining > 0 ? `The timer still has ${clock(main.remaining)} to go. ` : ""}
              The step is saved as finished early, which the run history notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep waiting</AlertDialogCancel>
            <AlertDialogAction onClick={() => act.next(true)}>Finish early</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

/** After a stage's last step: the checks the hide must pass before the next stage. */
export function StageCheckCard({ run }: { run: Run }) {
  const act = useRunActions(run)
  const stage = RECIPE.stages[run.stage]
  const next = RECIPE.stages[run.stage + 1]
  const [ticks, setTicks] = useState(() => stage.passChecks.map(() => false))
  const all = ticks.every(Boolean)
  return (
    <section className={cn(card, "mt-4")}>
      <div className={label}>{stage.name} finished</div>
      <h2 className="font-display mt-1 text-2xl leading-tight font-bold">Check the hide</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">
        Confirm each one before moving on to {next ? next.name.toLowerCase() : "unloading"}.
      </p>
      <div className="mt-4 space-y-2">
        {stage.passChecks.map((c, i) => (
          <CheckRow key={c} checked={ticks[i]} onToggle={() => setTicks((p) => p.map((v, j) => (j === i ? !v : v)))}>
            {c}
          </CheckRow>
        ))}
      </div>
      <CtaButton className="mt-5" disabled={!all} onClick={() => act.passStage(ticks)}>
        {next ? `Start ${next.name.toLowerCase()}` : "Continue"}
      </CtaButton>
      {!all && (
        <button
          type="button"
          onClick={() => act.passStage(ticks)}
          className="mt-2 w-full rounded-[14px] py-2.5 text-sm font-semibold text-brown hover:bg-brown-tint"
        >
          Not all passed? Continue anyway
        </button>
      )}
    </section>
  )
}

const QUALITIES: { v: Quality; label: string }[] = [
  { v: "good", label: "Good" },
  { v: "issues", label: "Some issues" },
  { v: "poor", label: "Poor" },
]

/** The end of a run: the leather comes out and the run is rated, which frees the tumbler. */
export function FinishCard({ run, t, onComplete }: { run: Run; t: TumblerInfo; onComplete: (runId: string) => void }) {
  const act = useRunActions(run)
  const [out, setOut] = useState(false)
  const [quality, setQuality] = useState<Quality | null>(null)
  const [note, setNote] = useState("")
  return (
    <section className={cn(card, "mt-4")}>
      <div className={label}>Every stage done</div>
      <h2 className="font-display mt-1 text-2xl leading-tight font-bold">Take the leather out</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">Once it&apos;s out, the run is complete and {t.name} is free for the next batch.</p>
      <div className="mt-4">
        <CheckRow checked={out} onToggle={() => setOut((v) => !v)}>
          The leather is out of the drum
        </CheckRow>
      </div>
      <div className="mt-4">
        <div className={label}>How did it turn out?</div>
        <div role="radiogroup" aria-label="How did it turn out?" className="mt-2 grid grid-cols-3 gap-2">
          {QUALITIES.map((q) => (
            <button
              key={q.v}
              type="button"
              role="radio"
              aria-checked={quality === q.v}
              onClick={() => setQuality(q.v)}
              className={cn(
                "rounded-xl border-[1.5px] px-2 py-3 text-sm font-semibold transition-colors",
                quality === q.v ? "border-brown bg-brown text-brown-foreground" : "border-tan bg-background hover:bg-brown-tint",
              )}
            >
              {q.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">The rating is what the suggestions learn from, so be honest.</p>
      </div>
      <label className="mt-4 block">
        <span className={label}>Notes (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Anything worth remembering next time"
          className="mt-2 w-full rounded-xl border-[1.5px] border-tan bg-background px-3 py-2.5 text-[15px]"
        />
      </label>
      <CtaButton
        className="mt-5"
        disabled={!out || !quality}
        onClick={() => {
          act.complete(quality!, note.trim())
          onComplete(run.id)
        }}
      >
        Complete run
      </CtaButton>
    </section>
  )
}
