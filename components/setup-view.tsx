"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Check, Pause, Play, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTumblers } from "@/lib/tumblers"
import { PROCESS_STAGES, formatAmount, secondsToClock, stepKey } from "@/lib/setup-recipe"
import { doneSteps, durationMinutes, progressPercent, totalSteps, useAllSetups, useTumblerSetup } from "@/lib/setup-state"
import { BackLink, CtaButton, PageTitle, Sub } from "@/components/tumbler/parts"

/** Setup guide for one tumbler. /setup?id=3 opens Tumbler 3's own steps, timers and batch weight. */
export function SetupView() {
  const raw = Number(useSearchParams().get("id") ?? 1)
  const { tumblers } = useTumblers()
  const id = tumblers.some((t) => t.id === raw) ? raw : (tumblers[0]?.id ?? 1)
  const name = tumblers.find((t) => t.id === id)?.name ?? `Tumbler ${id}`
  const getSetup = useAllSetups()

  return (
    <div>
      <BackLink href="/">Home</BackLink>
      <PageTitle>Setup guide</PageTitle>
      <Sub>Step by step for {name}. Each tumbler keeps its own progress, timers and batch weight.</Sub>

      {tumblers.length > 1 && (
        <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tumblers.map((t) => {
            const active = t.id === id
            return (
              <Link
                key={t.id}
                href={`/setup?id=${t.id}`}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full border-[1.5px] px-4 py-2 text-sm font-semibold transition-colors",
                  active ? "border-brown bg-brown text-brown-foreground" : "border-border bg-card hover:bg-brown-tint",
                )}
              >
                {t.name}
                <span className="ml-1.5 text-xs font-medium opacity-80">{Math.round(progressPercent(getSetup(t.id)))}%</span>
              </Link>
            )
          })}
        </div>
      )}

      <Guide key={id} id={id} />
    </div>
  )
}

function WeightInput({ value, onChange }: { value: number; onChange: (kg: number) => void }) {
  const [text, setText] = useState(String(value))
  return (
    <label className="flex items-center gap-2">
      <input
        inputMode="decimal"
        value={text}
        aria-label="Hide weight in kilograms"
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0) onChange(n)
        }}
        className="font-display h-11 w-24 rounded-xl border-[1.5px] border-tan bg-background px-3 text-right text-lg font-bold tabular-nums"
      />
      <span className="text-sm font-semibold text-muted-foreground">kg</span>
    </label>
  )
}

function Guide({ id }: { id: number }) {
  const { setup, actions } = useTumblerSetup(id)

  const stage = PROCESS_STAGES[setup.processIndex]
  const step = stage.steps[setup.stepIndex]
  const key = stepKey(setup.processIndex, setup.stepIndex)
  const completed = !!setup.completedSteps[key]
  const minutes = durationMinutes(setup)
  const long = step.longCycleConfig

  const stageDone = (p: number) => PROCESS_STAGES[p].steps.every((_, s) => setup.completedSteps[stepKey(p, s)])
  const allDone = PROCESS_STAGES.every((_, p) => stageDone(p))
  const isFirst = setup.processIndex === 0 && setup.stepIndex === 0
  const isLast = setup.processIndex === PROCESS_STAGES.length - 1 && setup.stepIndex === stage.steps.length - 1

  const timerLabel = long
    ? setup.longCyclePhase === "roll"
      ? `Roll ${Math.min(setup.longCycleCompletedRolls + 1, long.totalCycles)} of ${long.totalCycles}`
      : "Wait · next roll in"
    : "Countdown"

  const pct = progressPercent(setup)

  return (
    <div>
      {/* batch weight + overall progress */}
      <div className="mt-5 rounded-[20px] bg-brown-tint p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Batch weight</div>
            <div className="text-[13px] text-muted-foreground">Sets the chemical amounts</div>
          </div>
          <WeightInput value={setup.hideWeightKg} onChange={actions.setHideWeight} />
        </div>
        <div className="mt-4 flex items-center justify-between text-[13px] text-muted-foreground">
          <span>Overall progress</span>
          <span className="tabular-nums">
            {doneSteps(setup)} of {totalSteps()} steps
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background">
          <i className="block h-full rounded-full bg-brown transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* stages */}
      <div className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PROCESS_STAGES.map((st, p) => {
          const active = p === setup.processIndex
          const done = stageDone(p)
          return (
            <button
              key={st.id}
              type="button"
              aria-current={active ? "step" : undefined}
              onClick={() => {
                const open = st.steps.findIndex((_, s) => !setup.completedSteps[stepKey(p, s)])
                actions.goTo(p, open === -1 ? 0 : open)
              }}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border-[1.5px] px-3.5 py-2 text-sm font-semibold transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-brown-tint",
              )}
            >
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full text-[11px]",
                  active ? "bg-white/25" : done ? "bg-success text-white" : "bg-brown-tint text-brown",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3.5} /> : p + 1}
              </span>
              {st.name}
            </button>
          )
        })}
      </div>
      <p className="mt-2.5 text-sm text-muted-foreground">{stage.subtitle}</p>

      {/* current step */}
      <section className="mt-4 rounded-[22px] border-[1.5px] border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
            Step {setup.stepIndex + 1} of {stage.steps.length}
          </span>
          {completed && (
            <span className="flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
              <Check className="size-3.5" strokeWidth={3} />
              Done
            </span>
          )}
        </div>
        <h2 className="font-display mt-2 text-2xl leading-tight font-bold">{step.title}</h2>
        <p className="mt-1 text-base text-muted-foreground">{step.instruction}</p>

        {step.additions?.length ? (
          <ul className="mt-3 space-y-1.5">
            {step.additions.map((item) => (
              <li key={item} className="flex gap-2 rounded-xl bg-brown-tint px-3 py-2 text-sm">
                <span aria-hidden="true" className="font-bold text-brown">
                  +
                </span>
                {item}
              </li>
            ))}
          </ul>
        ) : null}
        {step.checks?.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {step.checks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}

        {minutes > 0 && (
          <div className="mt-4 rounded-[18px] bg-brown-tint p-4 text-center">
            <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{timerLabel}</div>
            <div className="font-display mt-1 text-[44px] leading-none font-bold tracking-tight tabular-nums">
              {secondsToClock(setup.remainingSeconds)}
            </div>
            {step.durationOptionsMinutes && step.durationOptionsMinutes.length > 1 && (
              <div className="mt-3 flex justify-center gap-2">
                {step.durationOptionsMinutes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => actions.chooseDuration(m)}
                    className={cn(
                      "rounded-full border-[1.5px] px-4 py-1.5 text-sm font-semibold transition-colors",
                      minutes === m ? "border-brown bg-brown text-brown-foreground" : "border-tan bg-background hover:bg-background/70",
                    )}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-center gap-3">
              <CtaButton
                className="flex w-auto items-center gap-2 px-7 py-3 text-base"
                onClick={setup.isRunning ? actions.pauseTimer : actions.startTimer}
                disabled={!setup.isRunning && setup.remainingSeconds <= 0}
              >
                {setup.isRunning ? <Pause className="size-4" /> : <Play className="size-4" />}
                {setup.isRunning ? "Pause" : "Start"}
              </CtaButton>
              <button
                type="button"
                onClick={actions.resetTimer}
                aria-label="Reset timer"
                className="grid size-11 place-items-center rounded-full text-brown hover:bg-background"
              >
                <RotateCcw className="size-5" />
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={actions.markDone}
          disabled={completed}
          className="mt-3 w-full rounded-[14px] py-2.5 text-sm font-semibold text-brown hover:bg-brown-tint disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent"
        >
          {completed ? "Step marked done" : "Mark step done"}
        </button>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <CtaButton variant="ghost" className="py-3.5 text-base" onClick={actions.prev} disabled={isFirst}>
          Previous
        </CtaButton>
        <CtaButton className="py-3.5 text-base" onClick={actions.next} disabled={isLast}>
          Next
        </CtaButton>
      </div>

      {/* chemicals, tucked away until needed */}
      <details className="mt-5 rounded-[18px] border-[1.5px] border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-semibold [&::-webkit-details-marker]:hidden">
          <span>Chemicals for {stage.name}</span>
          <span className="text-sm font-normal text-muted-foreground">{stage.chemicals.length} items</span>
        </summary>
        <div className="border-t border-border px-4 pb-2">
          <p className="py-2.5 text-[13px] text-muted-foreground">Amounts for {setup.hideWeightKg} kg of hide.</p>
          {stage.chemicals.map((c) => (
            <div key={c.name} className="flex items-baseline justify-between gap-3 border-t border-border/60 py-2.5">
              <span className="text-[15px]">{c.name}</span>
              <span className="shrink-0 text-right">
                <b className="font-display text-lg tabular-nums">{formatAmount((c.percent / 100) * setup.hideWeightKg, c.unit)}</b>
                <span className="ml-2 text-xs text-muted-foreground">{c.percent}%</span>
              </span>
            </div>
          ))}
        </div>
      </details>

      {stageDone(setup.processIndex) && !allDone && (
        <section className="mt-4 rounded-[22px] border-[1.5px] border-success/40 bg-success/10 p-4">
          <h3 className="font-display text-lg font-bold text-success">{stage.name} complete</h3>
          <p className="text-sm text-muted-foreground">Confirm these before moving on.</p>
          <ul className="mt-2 space-y-1.5">
            {stage.results.map((r) => (
              <li key={r} className="flex gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={3} />
                {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      {allDone && (
        <section className="mt-4 rounded-[22px] border-[1.5px] border-primary/40 bg-red-tint p-4 text-center">
          <h3 className="font-display text-lg font-bold">All stages complete</h3>
          <p className="mt-1 text-sm text-muted-foreground">Every step of the guide is done for this tumbler.</p>
          <CtaButton variant="ghost" className="mt-3 py-3 text-base" onClick={actions.restart}>
            Start over
          </CtaButton>
        </section>
      )}
    </div>
  )
}
