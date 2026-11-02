// The tanning recipe a run walks through: the Original recipe from "Tanning Techniques — English Guide".
// Amounts are a percentage of the hide weight going into the drum (200% water on 100 kg = 200 L).
// Water is measured in litres, everything else in kilograms.

export type Unit = "L" | "kg"
export type StageId = "soaking" | "liming" | "deliming" | "pickling" | "tanning"
/** Measurements and yes/no checks a run records; the suggestions learn from these. */
export type CheckKey = "limingPh" | "delimingCut" | "delimingPh" | "pickleDensity" | "picklePh"

export interface Addition {
  pct: number
  product: string
  unit: Unit
}

export type Action =
  /** tumble the drum; the first option is the default */
  | { kind: "run"; minutes: number[] }
  /** drum stopped */
  | { kind: "rest"; minutes: number }
  /** a short run at the start of every block, for hours */
  | { kind: "intermittent"; runMinutes: number; everyMinutes: number; hours: number }
  | { kind: "measure"; key: CheckKey; label: string; unit: string; target: [number, number]; sensor?: "ph"; hint?: string }
  | { kind: "confirm"; key: CheckKey; question: string; hint?: string }

export interface RecipeStep {
  id: string
  title: string
  adds?: Addition[]
  action?: Action
  /** things to do by hand after the action, each ticked off */
  tasks?: string[]
  note?: string
  caution?: string
}

export interface Stage {
  id: StageId
  name: string
  /** fits the phone's stage bar */
  short: string
  purpose: string
  steps: RecipeStep[]
  /** what the hide should look like before moving on */
  passChecks: string[]
}

/** Extra running added when a check comes in short ("keep running if not reached"). */
export const EXTRA_RUN_MINUTES = 15
/** From the batch worksheet's pump test: 20 L in 2 seconds. */
export const PUMP_FLOW_L_PER_MIN = 600

const water = (pct: number): Addition => ({ pct, product: "Water", unit: "L" })
const kg = (pct: number, product: string): Addition => ({ pct, product, unit: "kg" })

export const RECIPE: { id: string; name: string; stages: Stage[] } = {
  id: "original-v1",
  name: "Original recipe",
  stages: [
    {
      id: "soaking",
      short: "Soak",
      name: "Soaking",
      purpose: "Rehydrates and cleans the hide.",
      steps: [
        { id: "first-bath", title: "First bath", adds: [water(200)], action: { kind: "run", minutes: [30, 45, 60] }, tasks: ["Drain the drum"] },
        {
          id: "second-bath",
          title: "Second bath",
          adds: [water(200), kg(0.5, "Surfactant (wetting agent)"), kg(0.2, "Alkali")],
          action: { kind: "run", minutes: [30, 45, 60] },
          tasks: ["Drain through a grate"],
        },
      ],
      passChecks: [
        "Hide is fully hydrated, soft and clean",
        "Cut is whitish all the way through",
        "Sheet test passes: the hide lies limp and flat",
      ],
    },
    {
      id: "liming",
      short: "Lime",
      name: "Liming",
      purpose: "Removes the hair and swells the hide.",
      steps: [
        { id: "lime", title: "Water and lime", adds: [water(100), kg(0.8, "Lime")], action: { kind: "run", minutes: [30] } },
        { id: "sulfide", title: "Sodium sulfide", adds: [kg(1, "Sodium sulfide")], action: { kind: "run", minutes: [60] } },
        { id: "filter", title: "Filter out the hair", tasks: ["Filter the hair out of the liquor", "Return the filtered liquor to the drum"] },
        {
          id: "second-dose",
          title: "Second dose",
          adds: [kg(1, "Sodium sulfide"), kg(1, "Lime")],
          action: { kind: "run", minutes: [30] },
        },
        { id: "rest", title: "Rest", action: { kind: "rest", minutes: 30 } },
        {
          id: "intermittent",
          title: "Intermittent running",
          action: { kind: "intermittent", runMinutes: 10, everyMinutes: 120, hours: 24 },
          note: "Run the drum for 10 minutes at the start of every 2-hour block. The app reminds you when it's time.",
        },
        {
          id: "ph-check",
          title: "pH check",
          action: {
            kind: "measure",
            key: "limingPh",
            label: "Liquor pH",
            unit: "pH",
            target: [11, 12],
            sensor: "ph",
            hint: "If it's below 11, keep running and check again.",
          },
        },
        { id: "drain", title: "Drain, flesh and split", tasks: ["Drain and wash", "Flesh the hide", "Split the hide"] },
      ],
      passChecks: ["pH is 11–12", "Hide is swollen and free of hair"],
    },
    {
      id: "deliming",
      short: "Delime",
      name: "Deliming & bating",
      purpose: "Removes the lime and lowers the pH; the enzyme cleans the grain.",
      steps: [
        {
          id: "lactic",
          title: "Water and lactic acid",
          adds: [water(150), kg(1, "Lactic acid (Decaltal LG)")],
          action: { kind: "run", minutes: [30] },
        },
        {
          id: "cut-check",
          title: "Cut check",
          action: {
            kind: "confirm",
            key: "delimingCut",
            question: "Is the cut colorless all the way through?",
            hint: "Usually tested with phenolphthalein.",
          },
        },
        { id: "ammonium", title: "Ammonium sulfate", adds: [kg(1.5, "Ammonium sulfate")], action: { kind: "run", minutes: [30] } },
        { id: "enzyme", title: "Bating enzyme", adds: [kg(1, "Bating enzyme (Bazosin LG)")], action: { kind: "run", minutes: [60] } },
        {
          id: "ph-check",
          title: "pH check",
          action: { kind: "measure", key: "delimingPh", label: "Liquor pH", unit: "pH", target: [6, 7], sensor: "ph" },
        },
        { id: "drain", title: "Drain and wash", tasks: ["Drain and wash"] },
      ],
      passChecks: ["Cut is colorless", "pH is 6–7"],
    },
    {
      id: "pickling",
      short: "Pickle",
      name: "Pickling",
      purpose: "Salt and acid prepare the hide to take the tannin.",
      steps: [
        { id: "salt", title: "Water and salt", adds: [water(50), kg(7, "Salt")], action: { kind: "run", minutes: [20] } },
        {
          id: "density",
          title: "Brine density",
          action: {
            kind: "measure",
            key: "pickleDensity",
            label: "Brine density",
            unit: "°Bé",
            target: [6, 7],
            hint: "Measured with a Baumé hydrometer.",
          },
        },
        {
          id: "acid",
          title: "Oil and sulfuric acid",
          adds: [kg(0.25, "Oil (Liqurt)"), kg(0.5, "Sulfuric acid")],
          action: { kind: "run", minutes: [120] },
          caution:
            "This is sulfuric acid. The original sheet says “sulfide” here, but sodium sulfide in an acidic pickle releases toxic hydrogen sulfide gas. Check the container before adding.",
        },
        {
          id: "ph-check",
          title: "pH check",
          action: {
            kind: "measure",
            key: "picklePh",
            label: "Liquor pH",
            unit: "pH",
            target: [4, 5],
            sensor: "ph",
            hint: "The cut should be between yellow and green (bromocresol green).",
          },
        },
        { id: "icotan", title: "Icotan", adds: [kg(3, "Icotan")], action: { kind: "run", minutes: [240] } },
        { id: "drain", title: "Drain", tasks: ["Drain the drum"] },
      ],
      passChecks: ["Brine density is 6–7 °Bé", "pH is 4–5"],
    },
    {
      id: "tanning",
      short: "Tan",
      name: "Tanning",
      purpose: "Mimosa tannin turns the hide into leather.",
      steps: [
        { id: "mimosa", title: "Water and mimosa", adds: [water(40), kg(10, "Mimosa extract")], action: { kind: "run", minutes: [15] } },
        {
          id: "mimosa-2",
          title: "Second mimosa dose",
          adds: [kg(10, "Mimosa extract"), kg(3, "Dispersant (Icotan)")],
          action: { kind: "run", minutes: [120] },
        },
        { id: "oil", title: "Oil", adds: [kg(0.25, "Oil (Liqurt)")], note: "The recipe gives no run time after the oil." },
      ],
      // the source gives no end check for tanning; the run ends with taking the leather out
      passChecks: [],
    },
  ],
}

export const stepKey = (stage: Stage, step: RecipeStep) => `${stage.id}.${step.id}`

export const TOTAL_STEPS = RECIPE.stages.reduce((n, s) => n + s.steps.length, 0)

/** Minutes a step takes as written (the default option; intermittent counts its whole span). */
export function stepMinutes(step: RecipeStep, chosen?: number): number {
  const a = step.action
  if (!a) return 0
  if (a.kind === "run") return chosen ?? a.minutes[0]
  if (a.kind === "rest") return a.minutes
  if (a.kind === "intermittent") return a.hours * 60
  return 0
}

export const stageMinutes = (stage: Stage) => stage.steps.reduce((n, s) => n + stepMinutes(s), 0)
export const recipeMinutes = () => RECIPE.stages.reduce((n, s) => n + stageMinutes(s), 0)

export const amountOf = (a: Addition, hideKg: number) => (a.pct / 100) * hideKg

const trim = (n: number) => Number(n.toFixed(2)).toString()

/** 0.016 kg -> "16 g", 4 L -> "4 L", 0.0075 L -> "7.5 mL": readable at any size. */
export function formatAmount(value: number, unit: Unit): string {
  if (value >= 1) return `${trim(value)} ${unit}`
  const small = unit === "kg" ? "g" : "mL"
  const v = value * 1000
  if (v === 0) return `0 ${small}`
  return v >= 10 ? `${Math.round(v)} ${small}` : `${trim(Math.max(v, 0.1))} ${small}`
}

/** "about 40 s" at the pump flow from the batch worksheet. */
export function fillTime(litres: number): string {
  const s = Math.round((litres / PUMP_FLOW_L_PER_MIN) * 60)
  return s < 90 ? `about ${s} s to fill` : `about ${Math.round(s / 60)} min to fill`
}

/** Every product a run needs, added up, in recipe order. */
export function shoppingList(hideKg: number): { product: string; unit: Unit; amount: number }[] {
  const out = new Map<string, { product: string; unit: Unit; amount: number }>()
  for (const stage of RECIPE.stages)
    for (const step of stage.steps)
      for (const a of step.adds ?? []) {
        const row = out.get(a.product) ?? { product: a.product, unit: a.unit, amount: 0 }
        row.amount += amountOf(a, hideKg)
        out.set(a.product, row)
      }
  return [...out.values()]
}
