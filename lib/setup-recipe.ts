// The tanning process the Setup guide walks through. Content is unchanged from the original
// guide (amounts are a percentage of hide weight); only the demo videos were dropped.

export type ChemicalInput = {
  percent: number
  name: string
  unit: "kg" | "L"
}

export type Step = {
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

export type ProcessStage = {
  id: string
  name: string
  subtitle: string
  chemicals: ChemicalInput[]
  steps: Step[]
  results: string[]
}

export const PROCESS_STAGES: ProcessStage[] = [
  {
    id: "soaking",
    name: "Soaking",
    subtitle: "Hydrate and clean hides before chemical treatment.",
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

export const stepKey = (processIndex: number, stepIndex: number) => `p${processIndex}-s${stepIndex}`

export const secondsToClock = (value: number) => {
  const h = Math.floor(value / 3600)
  const m = Math.floor((value % 3600) / 60)
  const s = value % 60
  const mm = m.toString().padStart(2, "0")
  const ss = s.toString().padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const trim = (n: number) => Number(n.toFixed(2)).toString()

/** 0.016 kg -> "16 g", 4 L -> "4 L", 0.0075 L -> "7.5 mL": readable at any size. */
export function formatAmount(value: number, unit: "kg" | "L"): string {
  if (value >= 1) return `${trim(value)} ${unit}`
  const small = unit === "kg" ? "g" : "mL"
  const v = value * 1000
  if (v === 0) return `0 ${small}`
  return v >= 10 ? `${Math.round(v)} ${small}` : `${trim(Math.max(v, 0.1))} ${small}`
}
