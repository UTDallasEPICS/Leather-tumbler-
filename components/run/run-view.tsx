"use client"

// /run?id=N: start a run on tumbler N, follow it step by step, and finish it. On a phone it is one
// column; on desktop the whole run sits in a timeline on the left.

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Check, CircleCheck, Info, Lightbulb, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { RECIPE, formatAmount, recipeMinutes, shoppingList, stageMinutes, fillTime } from "@/lib/recipe"
import { fmtMinutes, fmtWhen, phaseOf, runProgress, useNow, useRunActions, useRuns, type Run } from "@/lib/runs"
import {
  MIN_RUNS_PATTERNS,
  MIN_RUNS_TYPICAL,
  historySummary,
  isSnoozed,
  liveWarnings,
  suggestionsFor,
  type LiveWarning,
} from "@/lib/run-insights"
import { useTumblers, type TumblerInfo } from "@/lib/tumblers"
import { BackLink, CtaButton, PageTitle, SectionTitle, StatusDot, Sub } from "@/components/tumbler/parts"
import { useDrumControl } from "@/components/tumbler/drum-control"
import { FinishCard, StageCheckCard, StepCard } from "@/components/run/step-card"
import { OverrideDialog, SyncLine } from "@/components/run/run-entry"

const card = "rounded-[22px] border-[1.5px] border-border p-4"

export function RunView() {
  const raw = Number(useSearchParams().get("id") ?? 1)
  const id = Number.isFinite(raw) ? raw : 1
  const { getTumbler } = useTumblers()
  const { activeRun, history } = useRuns()
  const t = getTumbler(id)
  const run = activeRun(id)
  const [finishedId, setFinishedId] = useState<string | null>(null)

  // demo tumblers appear one effect after mount; wait so a direct link doesn't flash "not found"
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  if (!t) {
    if (!ready) return null
    return (
      <div>
        <BackLink href="/">Home</BackLink>
        <PageTitle>Tumbler not found</PageTitle>
        <Sub>That tumbler isn&apos;t available right now.</Sub>
      </div>
    )
  }
  const finished = finishedId && !run ? history(id).find((r) => r.id === finishedId) : undefined
  return (
    <>
      <Notices t={t} />
      {finished ? (
        <RunComplete t={t} run={finished} onNew={() => setFinishedId(null)} />
      ) : run ? (
        <ActiveRun t={t} run={run} onComplete={setFinishedId} />
      ) : (
        <NewRun t={t} />
      )}
    </>
  )
}

/** What syncing had to sort out, such as two devices starting a run on the same tumbler. */
function Notices({ t }: { t: TumblerInfo }) {
  const { notices, dismissNotice } = useRuns()
  const list = notices(t.id)
  if (!list.length) return null
  return (
    <div className="mb-4 space-y-2">
      {list.map((n) => (
        <div key={n.id} role="alert" className="flex items-start gap-3 rounded-[18px] bg-brown-tint p-3.5 text-sm leading-snug">
          <Info className="mt-0.5 size-4 shrink-0 text-brown" />
          <p className="min-w-0 flex-1">{n.text}</p>
          <button type="button" onClick={() => dismissNotice(n.id)} className="shrink-0 font-semibold text-brown hover:underline">
            OK
          </button>
        </div>
      ))}
    </div>
  )
}

// ---- starting a run ---------------------------------------------------------------------------

function NewRun({ t }: { t: TumblerInfo }) {
  const { start, history, snoozed, snooze } = useRuns()
  const past = history(t.id)
  const summary = historySummary(past)
  const tips = suggestionsFor(past, t.name).filter((s) => !isSnoozed(s, snoozed, summary.completed))
  const [text, setText] = useState(() => String(past.find((r) => r.status === "completed")?.hideWeightKg ?? 200))
  const weight = Number(text.replace(",", "."))
  const valid = text.trim() !== "" && Number.isFinite(weight) && weight > 0 && weight <= 5000
  const list = shoppingList(valid ? weight : 0)

  const startButton = (
    <CtaButton disabled={!valid} onClick={() => start(t.id, weight)}>
      Start run
    </CtaButton>
  )

  return (
    <div>
      <BackLink href={`/tumbler?id=${t.id}`}>{t.name}</BackLink>
      <PageTitle>New run</PageTitle>
      <Sub>
        {t.name} · {RECIPE.name}: {RECIPE.stages.length} stages, about {fmtMinutes(recipeMinutes())} from start to finish.
      </Sub>

      <div className="lg:mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
        <div>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-[20px] bg-brown-tint p-4">
            <div>
              <div className="font-semibold">Hide weight</div>
              <div className="text-[13px] text-muted-foreground">Sets every amount in the run</div>
            </div>
            <label className="flex items-center gap-2">
              <input
                inputMode="decimal"
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label="Hide weight in kilograms"
                className="font-display h-12 w-28 rounded-xl border-[1.5px] border-tan bg-background px-3 text-right text-xl font-bold tabular-nums"
              />
              <span className="text-sm font-semibold text-muted-foreground">kg</span>
            </label>
          </div>

          <SectionTitle>From past runs</SectionTitle>
          {summary.completed + summary.overridden > 0 && (
            <p className="mb-3 text-[15px] text-muted-foreground">
              {summary.completed} completed
              {summary.overridden ? `, ${summary.overridden} overridden` : ""}
              {summary.avgHours !== null && ` · about ${Math.round(summary.avgHours)} h each`}
              {summary.goodShare !== null && ` · ${Math.round(summary.goodShare * 100)}% rated good`}
            </p>
          )}
          {tips.length > 0 ? (
            <div className="space-y-2.5">
              {tips.slice(0, 3).map((tip) => (
                <div key={tip.id} className="rounded-[18px] border-[1.5px] border-border p-4">
                  <div className="flex items-center gap-2 font-semibold">
                    <Lightbulb className="size-4 shrink-0 text-brown" />
                    {tip.title}
                  </div>
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">{tip.text}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{tip.detail}</span>
                    <button
                      type="button"
                      onClick={() => snooze(tip.id, summary.completed)}
                      className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Hide
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-[18px] bg-brown-tint p-4 text-sm leading-snug text-muted-foreground">
              {summary.completed < MIN_RUNS_PATTERNS
                ? `Suggestions build up as runs are logged. From ${MIN_RUNS_TYPICAL} completed runs on ${t.name} the app warns when readings drift from what's usual; from ${MIN_RUNS_PATTERNS} it points out what seems to move pH, temperature and drum speed. ${summary.completed} so far.`
                : "No clear patterns in the past runs yet. That's a good sign: the runs have been consistent."}
            </p>
          )}

          <SectionTitle>The stages</SectionTitle>
          <ol className="space-y-2">
            {RECIPE.stages.map((stage, i) => (
              <li key={stage.id}>
                <details className="group rounded-[18px] border-[1.5px] border-border">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 [&::-webkit-details-marker]:hidden">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brown-tint text-sm font-bold text-brown">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{stage.name}</span>
                      <span className="block text-[13px] text-muted-foreground">{stage.purpose}</span>
                    </span>
                    <span className="shrink-0 text-right text-[13px] text-muted-foreground">
                      {stage.steps.length} steps
                      <br />
                      {fmtMinutes(stageMinutes(stage))}
                    </span>
                  </summary>
                  <ol className="border-t border-border px-4 py-3 text-sm">
                    {stage.steps.map((st, j) => (
                      <li key={st.id} className="flex gap-2 py-1">
                        <span className="w-5 shrink-0 text-muted-foreground tabular-nums">{j + 1}.</span>
                        <span>
                          {st.title}
                          {st.adds && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {st.adds.map((a) => `${a.pct}% ${a.product.replace(/ \(.*\)$/, "").toLowerCase()}`).join(", ")}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ol>
        </div>

        <aside className="lg:sticky lg:top-6">
          <SectionTitle className="lg:mt-5">Have these ready</SectionTitle>
          <div className={cn(card, "py-1")}>
            {list.map((row) => (
              <div key={row.product} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2.5 last:border-0">
                <span className="text-[15px]">
                  {row.product}
                  {row.unit === "L" && valid && <span className="block text-xs text-muted-foreground">{fillTime(row.amount)} in all</span>}
                </span>
                <b className="font-display shrink-0 text-lg tabular-nums">{valid ? formatAmount(row.amount, row.unit) : "—"}</b>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Totals across the whole run. Each step shows its own amount when it&apos;s time to add it.
          </p>
          <div className="mt-5 hidden lg:block">{startButton}</div>
        </aside>
      </div>

      {/* on a phone the button stays in reach at the bottom */}
      <div className="sticky bottom-0 -mx-5 mt-6 bg-gradient-to-t from-background via-background to-transparent px-5 pt-6 pb-2 lg:hidden">
        {startButton}
      </div>
    </div>
  )
}

// ---- a run in progress ---------------------------------------------------------------------------

/** Phone: the five stages as pills, done / current / to come. */
function StageBar({ run }: { run: Run }) {
  return (
    <ol className="mt-3 grid grid-cols-5 gap-1.5 lg:hidden" aria-label="Stages">
      {RECIPE.stages.map((s, i) => {
        const state = i < run.stage ? "done" : i === run.stage ? "current" : "todo"
        return (
          <li
            key={s.id}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "flex items-center justify-center gap-1 rounded-full py-1.5 text-[12px] font-semibold",
              state === "done" && "bg-brown text-brown-foreground",
              state === "current" && "bg-primary text-primary-foreground",
              state === "todo" && "border-[1.5px] border-border text-muted-foreground",
            )}
          >
            {state === "done" && <Check className="size-3" strokeWidth={3.5} />}
            {s.short}
          </li>
        )
      })}
    </ol>
  )
}

function StepMarker({ state }: { state: "done" | "current" | "todo" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-full",
        state === "done" && "bg-success text-white",
        state === "current" && "bg-primary ring-4 ring-primary/20",
        state === "todo" && "border-2 border-border",
      )}
    >
      {state === "done" && <Check className="size-2.5" strokeWidth={4} />}
    </span>
  )
}

/** The steps of the current stage, or of every stage on desktop (others folded to one line). */
function StepList({ run, all = false }: { run: Run; all?: boolean }) {
  const stages = all ? RECIPE.stages.map((s, i) => [s, i] as const) : RECIPE.stages[run.stage] ? [[RECIPE.stages[run.stage], run.stage] as const] : []
  return (
    <div className="space-y-4">
      {stages.map(([stage, si]) => {
        const open = si === run.stage
        const stageState = si < run.stage ? "done" : open ? "current" : "todo"
        return (
          <div key={stage.id}>
            {all && (
              <div className="flex items-center gap-2.5">
                <StepMarker state={stageState} />
                <span className={cn("font-semibold", stageState === "todo" && "text-muted-foreground")}>{stage.name}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {stageState === "done" ? "Done" : fmtMinutes(stageMinutes(stage))}
                </span>
              </div>
            )}
            {open && (
              <ol className={cn("space-y-1.5", all && "mt-2 ml-[8px] border-l-2 border-border pl-4")}>
                {stage.steps.map((st, i) => {
                  const state = i < run.step ? "done" : i === run.step ? "current" : "todo"
                  return (
                    <li key={st.id} aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-2.5 text-sm">
                      <StepMarker state={state} />
                      <span className={cn(state === "current" ? "font-semibold" : state === "done" ? "text-muted-foreground line-through decoration-1" : "")}>
                        {st.title}
                      </span>
                    </li>
                  )
                })}
                {stage.passChecks.length > 0 && (
                  <li className="flex items-center gap-2.5 text-sm">
                    <StepMarker state={run.step === stage.steps.length ? "current" : "todo"} />
                    <span className={cn(run.step === stage.steps.length && "font-semibold")}>Check the hide</span>
                  </li>
                )}
              </ol>
            )}
          </div>
        )
      })}
      {all && (
        <div className="flex items-center gap-2.5">
          <StepMarker state={run.stage >= RECIPE.stages.length ? "current" : "todo"} />
          <span className={cn("font-semibold", run.stage < RECIPE.stages.length && "text-muted-foreground")}>Take the leather out</span>
        </div>
      )}
    </div>
  )
}

/** The drum right now: running or not, live readings, a start/stop button, and readings that are off for this stage. */
function LiveStrip({ t, warnings }: { t: TumblerInfo; warnings: LiveWarning[] }) {
  const drum = useDrumControl(t)
  const readings = [
    t.temp !== null ? `${t.temp.toFixed(1)}°C` : null,
    t.ph !== null ? `pH ${t.ph.toFixed(2)}` : null,
    t.rpm !== null ? `${t.rpm.toFixed(0)} rpm` : null,
  ].filter(Boolean)
  return (
    <div className="mt-4 rounded-[18px] border-[1.5px] border-border p-3">
      <div className="flex items-center gap-3">
        <span className="flex pl-1">
          <StatusDot online={t.online} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{!t.online ? "Tumbler offline" : t.running ? "Drum running" : "Drum stopped"}</div>
          <div className="truncate text-[13px] text-muted-foreground tabular-nums">
            {readings.length ? readings.join(" · ") : "No live readings"}
          </div>
        </div>
        {t.online && (
          <button
            type="button"
            onClick={drum.request}
            className={cn(
              "shrink-0 rounded-xl border-[1.5px] px-3.5 py-2 text-sm font-semibold transition-colors",
              t.running ? "border-primary text-primary hover:bg-red-tint" : "border-tan hover:bg-brown-tint",
            )}
          >
            {t.running ? "Stop drum" : "Start drum"}
          </button>
        )}
      </div>
      {warnings.map((w) => (
        <p key={w.id} className="mt-2.5 flex gap-2 rounded-xl bg-chart-3/20 px-3 py-2 text-[13px] leading-snug text-brown-dark">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {w.text}
        </p>
      ))}
      {drum.dialogs}
    </div>
  )
}

/** At most one suggestion per stage, a moment after the stage opens; "don't show again" holds until more runs are logged. */
function SuggestionPop({ run, t, history }: { run: Run; t: TumblerInfo; history: Run[] }) {
  const { snoozed, snooze, tipsShown } = useRuns()
  const act = useRunActions(run)
  const ph = phaseOf(run)
  const stageId = ph.kind === "finish" ? null : ph.stage.id
  const completed = history.filter((r) => r.status === "completed").length
  const tip =
    stageId && !tipsShown(run.id)[stageId]
      ? suggestionsFor(history, t.name).find((s) => s.stage === stageId && !isSnoozed(s, snoozed, completed))
      : undefined
  const [show, setShow] = useState(false)
  useEffect(() => {
    setShow(false)
    if (!tip) return
    const id = setTimeout(() => setShow(true), 1200)
    return () => clearTimeout(id)
  }, [tip?.id])

  if (!tip || !show || !stageId || ph.kind === "finish") return null
  return (
    <div
      role="status"
      className="animate-in fade-in-0 slide-in-from-bottom-2 fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),1rem)] z-40 mx-auto max-w-[34rem] rounded-[20px] border-[1.5px] border-border bg-popover p-4 shadow-[0_14px_30px_rgba(0,0,0,.18)] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[360px]"
    >
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-brown uppercase">
        <Lightbulb className="size-4" />
        Suggestion for {ph.stage.name.toLowerCase()}
      </div>
      <p className="mt-1.5 font-semibold">{tip.title}</p>
      <p className="mt-1 text-sm leading-snug text-muted-foreground">{tip.text}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{tip.detail}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => act.tipShown(stageId, tip.id)}
          className="rounded-xl bg-brown px-3 py-2.5 text-sm font-semibold text-brown-foreground"
        >
          Got it
        </button>
        <button
          type="button"
          onClick={() => {
            snooze(tip.id, completed)
            act.tipShown(stageId, tip.id)
          }}
          className="rounded-xl border-[1.5px] border-border px-3 py-2.5 text-sm font-semibold hover:bg-brown-tint"
        >
          Don&apos;t show again
        </button>
      </div>
    </div>
  )
}

function ActiveRun({ t, run, onComplete }: { t: TumblerInfo; run: Run; onComplete: (runId: string) => void }) {
  const now = useNow()
  const { history } = useRuns()
  const [overriding, setOverriding] = useState(false)
  const past = history(t.id)
  const ph = phaseOf(run)
  const stage = ph.kind === "finish" ? null : ph.stage
  const warnings = stage ? liveWarnings(past, stage, { temp: t.temp, ph: t.ph, rpm: t.rpm }, t.name) : []
  const pct = Math.round(runProgress(run) * 100)

  return (
    <div>
      <BackLink href={`/tumbler?id=${t.id}`}>{t.name}</BackLink>
      <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <nav aria-label="Run steps" className={cn(card, "max-h-[calc(100dvh-8rem)] overflow-y-auto")}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">Run #{run.number}</span>
              <span className="text-sm text-muted-foreground tabular-nums">{pct}%</span>
            </div>
            <div className="mt-2 mb-4 h-1.5 overflow-hidden rounded-full bg-border">
              <i className="block h-full rounded-full bg-brown transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <StepList run={run} all />
          </nav>
        </aside>

        <div className="min-w-0">
          <div className="text-[13px] text-muted-foreground">
            Run #{run.number} · {run.hideWeightKg} kg · started {fmtWhen(run.startedAt)}
          </div>
          <PageTitle>{stage ? stage.name : "Unload"}</PageTitle>
          <StageBar run={run} />
          <div className="mt-2 flex items-center gap-3 text-[13px] text-muted-foreground lg:hidden">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
              <i className="block h-full rounded-full bg-brown transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </span>
            <span className="tabular-nums">{pct}% of the run</span>
          </div>
          <SyncLine run={run} className="mt-2.5" />

          <LiveStrip t={t} warnings={warnings} />

          {ph.kind === "step" && <StepCard key={ph.key} run={run} t={t} history={past} now={now} />}
          {ph.kind === "stage-check" && <StageCheckCard key={ph.stage.id} run={run} />}
          {ph.kind === "finish" && <FinishCard run={run} t={t} onComplete={onComplete} />}

          {stage && (
            <div className="lg:hidden">
              <SectionTitle>In this stage</SectionTitle>
              <StepList run={run} />
            </div>
          )}

          <button
            type="button"
            onClick={() => setOverriding(true)}
            className="mt-8 w-full rounded-[14px] py-2.5 text-sm font-semibold text-muted-foreground hover:bg-brown-tint hover:text-foreground"
          >
            Something went wrong? Override this run
          </button>
        </div>
      </div>
      <OverrideDialog t={t} run={run} open={overriding} onOpenChange={setOverriding} />
      <SuggestionPop run={run} t={t} history={past} />
    </div>
  )
}

// ---- a run just finished ---------------------------------------------------------------------------

const QUALITY_LABEL = { good: "Good", issues: "Some issues", poor: "Poor" }

function RunComplete({ t, run, onNew }: { t: TumblerInfo; run: Run; onNew: () => void }) {
  const took = ((run.endedAt ?? Date.now()) - run.startedAt) / 60_000
  return (
    <div className="lg:mx-auto lg:max-w-xl">
      <BackLink href={`/tumbler?id=${t.id}`}>{t.name}</BackLink>
      <div className="mt-4 rounded-[22px] bg-success/10 p-6 text-center">
        <CircleCheck className="mx-auto size-12 text-success" />
        <h1 className="font-display mt-3 text-[30px] leading-tight font-bold">Run #{run.number} complete</h1>
        <p className="mt-2 text-base text-muted-foreground">
          {fmtMinutes(took)} from start to finish
          {run.outcome && `, rated ${QUALITY_LABEL[run.outcome.quality].toLowerCase()}`}. {t.name} is ready for the next batch.
        </p>
      </div>
      <CtaButton className="mt-5" onClick={onNew}>
        Start a new run
      </CtaButton>
      <Link
        href={`/tumbler?id=${t.id}`}
        className="mt-2.5 block w-full rounded-[18px] border-2 border-primary px-4 py-3.5 text-center text-base font-semibold text-primary hover:bg-red-tint"
      >
        Back to {t.name}
      </Link>
    </div>
  )
}
