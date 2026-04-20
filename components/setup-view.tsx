"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

type ChemicalInput = {
  percent: number
  name: string
  unit: "kg" | "L"
}

type Step = {
  title: string
  instruction: string
  durationOptionsMinutes?: number[]
  defaultDurationMinutes?: number
  longCycleConfig?: {
    rollMinutes: number
    waitMinutes: number
    totalCycles: number
  }
  additions?: string[]
  checks?: string[]
}

type ProcessStage = {
  id: string
  name: string
  subtitle: string
  animationEmbedUrl: string
  chemicals: ChemicalInput[]
  steps: Step[]
  results: string[]
}

const PROCESS_STAGES: ProcessStage[] = [
  {
    id: "soaking",
    name: "Soaking",
    subtitle: "Hydrate and clean hides before chemical treatment.",
    animationEmbedUrl: "https://www.youtube.com/embed/FMxQiW2zQw4?autoplay=1&mute=1&loop=1&playlist=FMxQiW2zQw4",
    chemicals: [
      { percent: 2, name: "Water", unit: "L" },
      { percent: 0.005, name: "Surfactant", unit: "kg" },
      { percent: 0.002, name: "Alkali", unit: "kg" },
    ],
    steps: [
      {
        title: "Initial soak",
        instruction: "Roll 30-60 min.",
        durationOptionsMinutes: [30, 60],
        defaultDurationMinutes: 30,
        additions: ["Add 2% water before rolling."],
      },
      {
        title: "Drain",
        instruction: "Drain the tumbler.",
        additions: ["Open drain and remove liquor completely."],
      },
      {
        title: "Second soak",
        instruction: "Roll 30-60 min (repeat soak with screen).",
        durationOptionsMinutes: [30, 60],
        defaultDurationMinutes: 30,
        additions: ["Add 2% water + 0.005% surfactant + 0.002% alkali.", "Use screen while draining at end of this soak."],
      },
      {
        title: "Drain with screen",
        instruction: "Drain using the screen.",
      },
    ],
    results: [
      "Skin fully hydrated",
      "Whitish cross-section",
      "Skin soft and clean",
      "Proteins partially removed",
      "Adequate sheet test",
    ],
  },
  {
    id: "liming",
    name: "Liming",
    subtitle: "Open hide fibers, remove hair, and raise pH to 11-12.",
    animationEmbedUrl: "https://www.youtube.com/embed/X813k4weapk?autoplay=1&mute=1&loop=1&playlist=X813k4weapk",
    chemicals: [
      { percent: 1, name: "Water", unit: "L" },
      { percent: 0.008, name: "Lime", unit: "kg" },
      { percent: 0.01, name: "Sodium Sulfide", unit: "kg" },
      { percent: 0.01, name: "Sodium Sulfide (second addition)", unit: "kg" },
      { percent: 0.01, name: "Lime (final addition)", unit: "kg" },
    ],
    steps: [
      {
        title: "First roll",
        instruction: "Roll 30 min.",
        durationOptionsMinutes: [30],
        defaultDurationMinutes: 30,
        additions: ["Add 1% water + 0.008% lime."],
      },
      {
        title: "Second roll",
        instruction: "Roll 1 hour.",
        durationOptionsMinutes: [60],
        defaultDurationMinutes: 60,
        additions: ["Add 0.01% sodium sulfide after the first 30-minute roll."],
      },
      {
        title: "Filter hair",
        instruction: "Filter hair and return filtered liquor to drum.",
      },
      {
        title: "Third roll",
        instruction: "Roll 30 min.",
        durationOptionsMinutes: [30],
        defaultDurationMinutes: 30,
        additions: ["Add 0.01% sodium sulfide + 0.01% lime."],
      },
      {
        title: "Rest",
        instruction: "Rest 30 min.",
        durationOptionsMinutes: [30],
        defaultDurationMinutes: 30,
      },
      {
        title: "Long cycle",
        instruction: "Roll 10 min every 2 hrs for 24 hrs.",
        durationOptionsMinutes: [10],
        defaultDurationMinutes: 10,
        longCycleConfig: {
          rollMinutes: 10,
          waitMinutes: 120,
          totalCycles: 12,
        },
        checks: ["After each 10-minute roll, wait for a full 2-hour countdown before rolling again."],
      },
      {
        title: "pH check",
        instruction: "Check pH 11-12. If not met, keep rolling.",
      },
      {
        title: "Final cleanup",
        instruction: "Filter hair, return liquor, drain and wash, then flesh and split.",
      },
    ],
    results: [
      "Pelt is swollen and de-haired",
      "pH stabilized in 11-12 range",
      "Ready for deliming and bating",
    ],
  },
  {
    id: "deliming-bating",
    name: "Deliming & Bating",
    subtitle: "Lower alkalinity and enzymatically clean the fiber structure.",
    animationEmbedUrl: "https://www.youtube.com/embed/DyN_xX8NEIk?autoplay=1&mute=1&loop=1&playlist=DyN_xX8NEIk",
    chemicals: [
      { percent: 1.5, name: "Water", unit: "L" },
      { percent: 0.01, name: "Lactic Acid (Decaltal LG)", unit: "kg" },
      { percent: 0.015, name: "Ammonium Sulfate", unit: "kg" },
      { percent: 0.01, name: "Enzyme (Bazosin LG)", unit: "kg" },
    ],
    steps: [
      {
        title: "First roll",
        instruction: "Roll 30 min.",
        durationOptionsMinutes: [30],
        defaultDurationMinutes: 30,
        additions: ["Add 1.5% water + 0.01% lactic acid."],
      },
      {
        title: "Cross-section check",
        instruction: "Check pH and confirm colorless cross-section.",
      },
      {
        title: "Second roll",
        instruction: "Roll 30 min.",
        durationOptionsMinutes: [30],
        defaultDurationMinutes: 30,
        additions: ["Add 0.015% ammonium sulfate."],
      },
      {
        title: "Third roll",
        instruction: "Roll 1 hour.",
        durationOptionsMinutes: [60],
        defaultDurationMinutes: 60,
        additions: ["Add 0.01% enzyme (Bazosin LG)."],
      },
      {
        title: "Final check and drain",
        instruction: "Check pH 6-7, then drain and wash.",
      },
    ],
    results: [
      "Lime residues removed",
      "Fiber softened by bating",
      "pH adjusted to 6-7",
    ],
  },
  {
    id: "pickling",
    name: "Pickling",
    subtitle: "Acidify and salt the hide before tanning penetration.",
    animationEmbedUrl: "https://www.youtube.com/embed/AhqvHWDAEjE?autoplay=1&mute=1&loop=1&playlist=AhqvHWDAEjE",
    chemicals: [
      { percent: 0.5, name: "Water", unit: "L" },
      { percent: 0.07, name: "Salt", unit: "kg" },
      { percent: 0.0025, name: "Oil (Liquort)", unit: "kg" },
      { percent: 0.005, name: "Sulfide", unit: "kg" },
      { percent: 0.03, name: "Icotan", unit: "kg" },
    ],
    steps: [
      {
        title: "First roll",
        instruction: "Roll 20 min.",
        durationOptionsMinutes: [20],
        defaultDurationMinutes: 20,
        additions: ["Add 0.5% water + 0.07% salt."],
      },
      {
        title: "Density check",
        instruction: "Check density 6-7.",
      },
      {
        title: "Second roll",
        instruction: "Roll 2 hours.",
        durationOptionsMinutes: [120],
        defaultDurationMinutes: 120,
        additions: ["Add 0.0025% oil (Liquort) + 0.005% sulfide."],
      },
      {
        title: "pH check",
        instruction: "Check pH 4-5 (yellow-green cross-section).",
      },
      {
        title: "Third roll",
        instruction: "Roll 4 hours.",
        durationOptionsMinutes: [240],
        defaultDurationMinutes: 240,
        additions: ["Add 0.03% Icotan."],
      },
      {
        title: "Drain",
        instruction: "Drain the bath.",
      },
    ],
    results: [
      "Pickle penetration achieved",
      "pH in 4-5 range",
      "Ready for tanning agents",
    ],
  },
  {
    id: "tanning",
    name: "Tanning",
    subtitle: "Fix tanning agents to stabilize and preserve leather.",
    animationEmbedUrl: "https://www.youtube.com/embed/lT4HaFcH0-Y?autoplay=1&mute=1&loop=1&playlist=lT4HaFcH0-Y",
    chemicals: [
      { percent: 0.4, name: "Water", unit: "L" },
      { percent: 0.1, name: "Mimosa", unit: "kg" },
      { percent: 0.1, name: "Mimosa (second addition)", unit: "kg" },
      { percent: 0.03, name: "Dispersant (Icotan)", unit: "kg" },
      { percent: 0.0025, name: "Oil (Liquort)", unit: "kg" },
    ],
    steps: [
      {
        title: "First roll",
        instruction: "Roll 15 min.",
        durationOptionsMinutes: [15],
        defaultDurationMinutes: 15,
        additions: ["Add 0.4% water + 0.1% mimosa."],
      },
      {
        title: "Second roll",
        instruction: "Roll 2 hours.",
        durationOptionsMinutes: [120],
        defaultDurationMinutes: 120,
        additions: ["Add 0.1% second mimosa + 0.03% dispersant + 0.0025% oil."],
      },
    ],
    results: [
      "Leather stabilized by tannins",
      "Chemicals evenly distributed",
      "Tanning phase complete",
    ],
  },
]

const secondsToClock = (value: number) => {
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

const getStepKey = (processIndex: number, stepIndex: number) => `p${processIndex}-s${stepIndex}`

export function SetupView() {
  const [hideWeightKg, setHideWeightKg] = useState(200)
  const [processIndex, setProcessIndex] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [selectedDurations, setSelectedDurations] = useState<Record<string, number>>({})
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({})
  const [longCyclePhase, setLongCyclePhase] = useState<"roll" | "wait">("roll")
  const [longCycleCompletedRolls, setLongCycleCompletedRolls] = useState(0)

  const currentProcess = PROCESS_STAGES[processIndex]
  const currentStep = currentProcess.steps[stepIndex]
  const currentStepKey = getStepKey(processIndex, stepIndex)

  const getDurationForStep = useCallback(
    (pIndex: number, sIndex: number) => {
      const process = PROCESS_STAGES[pIndex]
      const step = process.steps[sIndex]
      const key = getStepKey(pIndex, sIndex)
      return selectedDurations[key] ?? step.defaultDurationMinutes ?? step.durationOptionsMinutes?.[0] ?? 0
    },
    [selectedDurations]
  )

  const activeDuration = useMemo(() => getDurationForStep(processIndex, stepIndex), [getDurationForStep, processIndex, stepIndex])

  const markStepComplete = useCallback((key: string) => {
    setCompletedSteps((prev) => ({ ...prev, [key]: true }))
  }, [])

  useEffect(() => {
    setIsRunning(false)
    setLongCyclePhase("roll")
    setLongCycleCompletedRolls(0)
    setRemainingSeconds(activeDuration * 60)
  }, [activeDuration, processIndex, stepIndex])

  useEffect(() => {
    if (!isRunning || remainingSeconds <= 0) return
    const timerId = window.setInterval(() => {
      setRemainingSeconds((prev) => Math.max(prev - 1, 0))
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [isRunning, remainingSeconds])

  useEffect(() => {
    if (isRunning && remainingSeconds === 0) {
      const longCycle = currentStep.longCycleConfig
      if (longCycle) {
        if (longCyclePhase === "roll") {
          const nextRollCount = longCycleCompletedRolls + 1
          setLongCycleCompletedRolls(nextRollCount)
          if (nextRollCount >= longCycle.totalCycles) {
            setIsRunning(false)
            markStepComplete(currentStepKey)
          } else {
            setLongCyclePhase("wait")
            setRemainingSeconds(longCycle.waitMinutes * 60)
          }
        } else {
          setLongCyclePhase("roll")
          setRemainingSeconds(longCycle.rollMinutes * 60)
        }
      } else {
        setIsRunning(false)
        markStepComplete(currentStepKey)
      }
    }
  }, [currentStep, currentStepKey, isRunning, longCycleCompletedRolls, longCyclePhase, markStepComplete, remainingSeconds])

  const processCompletion = useMemo(() => {
    return PROCESS_STAGES.map((stage, pIdx) => {
      const total = stage.steps.length
      const complete = stage.steps.filter((_, sIdx) => completedSteps[getStepKey(pIdx, sIdx)]).length
      return { total, complete, percent: total === 0 ? 0 : (complete / total) * 100 }
    })
  }, [completedSteps])

  const allProcessesComplete = processCompletion.every((item) => item.complete === item.total)
  const currentProcessComplete = processCompletion[processIndex]?.complete === processCompletion[processIndex]?.total
  const overallPercent = useMemo(() => {
    const totalSteps = PROCESS_STAGES.reduce((sum, stage) => sum + stage.steps.length, 0)
    const completeSteps = PROCESS_STAGES.reduce(
      (sum, stage, pIdx) => sum + stage.steps.filter((_, sIdx) => completedSteps[getStepKey(pIdx, sIdx)]).length,
      0
    )
    return totalSteps === 0 ? 0 : (completeSteps / totalSteps) * 100
  }, [completedSteps])

  const goToPrevStep = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1)
      return
    }
    if (processIndex > 0) {
      const prevProcessIndex = processIndex - 1
      setProcessIndex(prevProcessIndex)
      setStepIndex(PROCESS_STAGES[prevProcessIndex].steps.length - 1)
    }
  }

  const goToNextStep = () => {
    if (stepIndex < currentProcess.steps.length - 1) {
      setStepIndex(stepIndex + 1)
      return
    }
    if (processIndex < PROCESS_STAGES.length - 1) {
      setProcessIndex(processIndex + 1)
      setStepIndex(0)
    }
  }

  const restartSetup = () => {
    setProcessIndex(0)
    setStepIndex(0)
    setIsRunning(false)
    setCompletedSteps({})
    setSelectedDurations({})
    setRemainingSeconds(getDurationForStep(0, 0))
  }

  const canMovePrev = !(processIndex === 0 && stepIndex === 0)
  const isLastStep = processIndex === PROCESS_STAGES.length - 1 && stepIndex === currentProcess.steps.length - 1
  const canMoveNext = !isLastStep
  const hasTimer = activeDuration > 0

  return (
    <div className="space-y-4 pb-6">
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Setup</CardTitle>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Overall completion</span>
              <span>{overallPercent.toFixed(0)}%</span>
            </div>
            <Progress value={overallPercent} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="text-sm font-medium text-foreground" htmlFor="hide-weight-input">
            Hide weight (kg)
          </label>
          <input
            id="hide-weight-input"
            type="number"
            min={0}
            step="any"
            value={hideWeightKg}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (Number.isFinite(next) && next >= 0) setHideWeightKg(next)
            }}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/70">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>
                Process {processIndex + 1}: {currentProcess.name}
              </CardTitle>
              <CardDescription>{currentProcess.subtitle}</CardDescription>
            </div>
            <Badge variant="secondary">
              Step {stepIndex + 1}/{currentProcess.steps.length}
            </Badge>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{currentProcess.name} progress</span>
              <span>
                {processCompletion[processIndex]?.complete}/{processCompletion[processIndex]?.total}
              </span>
            </div>
            <Progress value={processCompletion[processIndex]?.percent ?? 0} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border/50">
            <div className="aspect-video w-full bg-black">
              <iframe
                title={`${currentProcess.name} process animation`}
                src={currentProcess.animationEmbedUrl}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/70">
        <CardHeader>
          <CardTitle>Chemicals / Inputs ({currentProcess.name})</CardTitle>
          <CardDescription>Use these quantities for {hideWeightKg} kg hide weight.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {currentProcess.chemicals.map((chemical) => {
              const amount = (chemical.percent / 100) * hideWeightKg
              return (
                <div key={`${currentProcess.id}-${chemical.name}`} className="rounded-lg border border-border/50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{chemical.name}</span>
                    <Badge variant="outline">{chemical.percent}%</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Add <span className="font-semibold text-foreground">{amount.toFixed(4)} {chemical.unit}</span>
                  </p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/70">
        <CardHeader>
          <CardTitle>Current Subprocess</CardTitle>
          <CardDescription>
            {currentStep.title} - {currentStep.instruction}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border/50 p-3">
            <p className="text-sm font-medium text-foreground">{currentStep.instruction}</p>
            {currentStep.additions?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {currentStep.additions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {currentStep.checks?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {currentStep.checks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {currentStep.durationOptionsMinutes?.length ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Timer option</p>
              <div className="flex flex-wrap gap-2">
                {currentStep.durationOptionsMinutes.map((minutes) => (
                  <Button
                    key={minutes}
                    type="button"
                    variant={activeDuration === minutes ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedDurations((prev) => ({
                        ...prev,
                        [currentStepKey]: minutes,
                      }))
                      setRemainingSeconds(minutes * 60)
                      setLongCyclePhase("roll")
                      setLongCycleCompletedRolls(0)
                    }}
                  >
                    {minutes} min
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-border/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {currentStep.longCycleConfig
                    ? longCyclePhase === "roll"
                      ? `Roll countdown (${longCycleCompletedRolls + 1}/${currentStep.longCycleConfig.totalCycles})`
                      : "Wait countdown (next roll in)"
                    : "Countdown"}
                </p>
                <p className="text-3xl font-bold tabular-nums text-foreground">{secondsToClock(remainingSeconds)}</p>
              </div>
              {completedSteps[currentStepKey] ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="size-3.5" />
                  Completed
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <Clock3 className="size-3.5" />
                  In progress
                </Badge>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => setIsRunning(true)} disabled={!hasTimer || isRunning}>
                Start timer
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setIsRunning(false)} disabled={!isRunning}>
                Pause timer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsRunning(false)
                  setLongCyclePhase("roll")
                  setLongCycleCompletedRolls(0)
                  setRemainingSeconds(activeDuration * 60)
                }}
              >
                Reset timer
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => markStepComplete(currentStepKey)}>
                Mark step complete
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={goToPrevStep} disabled={!canMovePrev} className="gap-2">
              <ArrowLeft className="size-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant={isLastStep ? "default" : "outline"}
              onClick={isLastStep ? restartSetup : goToNextStep}
              disabled={!isLastStep && !canMoveNext}
              className="gap-2"
            >
              {isLastStep ? "Finish" : "Next"}
              {!isLastStep ? <ArrowRight className="size-4" /> : null}
            </Button>
          </div>
        </CardContent>
      </Card>

      {currentProcessComplete ? (
        <Card className="border-green-600/40 bg-green-950/20">
          <CardHeader>
            <CardTitle className="text-green-300">{currentProcess.name} results</CardTitle>
            <CardDescription>Phase complete. Confirm outcomes before moving on.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-green-100/90">
              {currentProcess.results.map((result) => (
                <li key={result}>{result}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {allProcessesComplete ? (
        <Card className="border-primary/50 bg-primary/10">
          <CardHeader>
            <CardTitle>Setup Complete</CardTitle>
            <CardDescription>All configured processes and subprocesses are complete.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Press restart if you need to run the full setup guide again.
            </p>
            <Button type="button" onClick={restartSetup} className="gap-2">
              <RotateCcw className="size-4" />
              Restart setup
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

