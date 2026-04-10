"use client"
//this page was so that users can set their own limits and cycel counts
import { useState, useEffect } from "react"
import { Save, Thermometer, Zap, Droplets } from "lucide-react"
import { useDashboard, type Config } from "@/lib/dashboard-context"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function ConfigField({
  id,
  label,
  description,
  value,
  onChange,
  icon: Icon,
  unit,
}: {
  id: string
  label: string
  description: string
  value: number
  onChange: (val: number) => void
  icon: React.ElementType
  unit: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent/30 p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-primary/20">
          <Icon className="size-4 text-primary" />
        </div>
        <div>
          <Label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
          </Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="max-w-[200px] tabular-nums"
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}

export function ConfigureView() {
  const { config, updateConfig } = useDashboard()
  const [localConfig, setLocalConfig] = useState<Config>(config)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setLocalConfig(config)
  }, [config])

  const handleSave = () => {
    updateConfig(localConfig)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const hasChanges =
    localConfig.heatLimit !== config.heatLimit ||
    localConfig.numCycles !== config.numCycles ||
    localConfig.phMin !== config.phMin ||
    localConfig.phMax !== config.phMax

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground text-balance">Configure</h1>
        <p className="text-sm text-muted-foreground">
          Adjust sensor thresholds and cycle parameters
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sensor Limits</CardTitle>
          <CardDescription>
            Set the maximum thresholds for your monitoring session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <ConfigField
              id="heat-limit"
              label="Heat Limit"
              description="Maximum temperature before alarm"
              value={localConfig.heatLimit}
              onChange={(val) =>
                setLocalConfig((prev) => ({ ...prev, heatLimit: val }))
              }
              icon={Thermometer}
              unit={"\u00B0C"}
            />
            <ConfigField
              id="num-cycles"
              label="Number of Cycles"
              description="Target cycle count for session"
              value={localConfig.numCycles}
              onChange={(val) =>
                setLocalConfig((prev) => ({ ...prev, numCycles: val }))
              }
              icon={Zap}
              unit="cycles"
            />
            <ConfigField
              id="ph-min"
              label="pH Minimum"
              description="Emergency stop below this pH"
              value={localConfig.phMin}
              onChange={(val) =>
                setLocalConfig((prev) => ({ ...prev, phMin: val }))
              }
              icon={Droplets}
              unit="pH"
            />
            <ConfigField
              id="ph-max"
              label="pH Maximum"
              description="Emergency stop above this pH"
              value={localConfig.phMax}
              onChange={(val) =>
                setLocalConfig((prev) => ({ ...prev, phMax: val }))
              }
              icon={Droplets}
              unit="pH"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={!hasChanges && !saved}
          className="gap-2"
        >
          <Save className="size-4" />
          {saved ? "Saved" : "Save Configuration"}
        </Button>
        {hasChanges && (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
      </div>
    </div>
  )
}
