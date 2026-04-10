"use client"
// this code handles the demo toggle, server ip section as well as the shelly connection.
import { useState, useEffect } from "react"
import { Save, Server, Wifi, Plug, Power, CheckCircle2, XCircle, FlaskConical, Radio } from "lucide-react"
import { useDashboard } from "@/lib/dashboard-context"
import { getSettings, saveSettings, type Settings } from "@/lib/settings"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
//this is env var that i put so that we easily change between whether its an apk or pwa
const IS_PWA = process.env.NEXT_PUBLIC_TARGET === 'pwa'

type TestStatus = "idle" | "testing" | "success" | "error"

export function SettingsView() {
  const { connectionStatus, reconnect, shellyDirectOn, shellyDirectOff } = useDashboard()
  const [local, setLocal] = useState<Settings>(() => getSettings())
  const [saved, setSaved] = useState(false)
  const [shellyTest, setShellyTest] = useState<TestStatus>("idle")
  const [shellyTestMsg, setShellyTestMsg] = useState("")
  const [wsTest, setWsTest] = useState<TestStatus>("idle")
  const [wsTestMsg, setWsTestMsg] = useState("")

  // Sync from localStorage on mount
  useEffect(() => {
    setLocal(getSettings())
  }, [])

  const hasChanges = (() => {
    const current = getSettings()
    return (
      local.serverIp !== current.serverIp ||
      local.serverPort !== current.serverPort ||
      local.shellyIp !== current.shellyIp ||
      local.shellyDirectEnabled !== current.shellyDirectEnabled ||
      local.demoMode !== current.demoMode
    )
  })()

  const handleSave = () => {
    saveSettings(local)
    setSaved(true)
    reconnect()
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestWs = () => {
    const url = `ws://${local.serverIp}:${local.serverPort}`
    setWsTest("testing")
    setWsTestMsg("")
    const ws = new WebSocket(url)
    const timer = setTimeout(() => {
      ws.close()
      setWsTest("error")
      setWsTestMsg("Timed out")
    }, 5000)
    ws.onopen = () => {
      clearTimeout(timer)
      ws.close()
      setWsTest("success")
      setWsTestMsg("Connected")
    }
    ws.onerror = () => {
      clearTimeout(timer)
      setWsTest("error")
      setWsTestMsg("Unreachable")
    }
  }

  const handleTestShelly = async () => {
    if (!local.shellyIp) return
    setShellyTest("testing")
    setShellyTestMsg("")
    try {
      const resp = await fetch(`http://${local.shellyIp}/rpc/Shelly.GetDeviceInfo`, {
        signal: AbortSignal.timeout(5000),
      })
      if (resp.ok) {
        const info = await resp.json()
        setShellyTest("success")
        setShellyTestMsg(info.model || "Connected")
      } else {
        setShellyTest("error")
        setShellyTestMsg(`HTTP ${resp.status}`)
      }
    } catch {
      setShellyTest("error")
      setShellyTestMsg("Unreachable")
    }
  }

  const connectionDot =
    connectionStatus === "connected"
      ? "bg-primary"
      : connectionStatus === "connecting"
        ? "bg-chart-3"
        : "bg-destructive"

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground text-balance">Connection</h1>
        <p className="text-sm text-muted-foreground">
          Configure server and relay addresses
        </p>
      </div>

      {/* Demo Mode */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between rounded-lg border border-border bg-accent/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-chart-2/20">
                <FlaskConical className="size-4 text-chart-2" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Demo Mode</p>
                <p className="text-xs text-muted-foreground">
                  Simulate sensor data without a server connection
                </p>
              </div>
            </div>
            <Switch
              checked={local.demoMode}
              onCheckedChange={(checked) =>
                setLocal((prev) => ({ ...prev, demoMode: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Server Connection — hidden in PWA build (URL auto-derived from page host) */}
      {!IS_PWA && <Card>
        <CardHeader>
          <CardTitle>Server</CardTitle>
          <CardDescription>
            Raspberry Pi WebSocket server address
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/20">
                  <Server className="size-4 text-primary" />
                </div>
                <div>
                  <Label htmlFor="server-ip" className="text-sm font-medium text-foreground">
                    Server IP
                  </Label>
                  <p className="text-xs text-muted-foreground">IP address of the Raspberry Pi</p>
                </div>
              </div>
              <Input
                id="server-ip"
                type="text"
                placeholder="192.168.1.x"
                value={local.serverIp}
                onChange={(e) => setLocal((prev) => ({ ...prev, serverIp: e.target.value }))}
                className="max-w-[200px]"
              />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/20">
                  <Wifi className="size-4 text-primary" />
                </div>
                <div>
                  <Label htmlFor="server-port" className="text-sm font-medium text-foreground">
                    Port
                  </Label>
                  <p className="text-xs text-muted-foreground">WebSocket server port</p>
                </div>
              </div>
              <Input
                id="server-port"
                type="number"
                value={local.serverPort}
                onChange={(e) => setLocal((prev) => ({ ...prev, serverPort: Number(e.target.value) }))}
                className="max-w-[200px] tabular-nums"
              />
            </div>

            <div className="flex flex-col gap-2 px-1">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleTestWs}
                  disabled={!local.serverIp || wsTest === "testing"}
                >
                  <Radio className="size-3.5" />
                  {wsTest === "testing" ? "Testing..." : "Test Connection"}
                </Button>
              </div>
              {wsTest !== "idle" && wsTest !== "testing" && (
                <div className="flex items-center gap-1.5 text-xs">
                  {wsTest === "success" ? (
                    <CheckCircle2 className="size-3.5 text-primary" />
                  ) : (
                    <XCircle className="size-3.5 text-destructive" />
                  )}
                  <span className={wsTest === "success" ? "text-primary" : "text-destructive"}>
                    {wsTestMsg}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className={cn("size-2.5 rounded-full", connectionDot)} />
                <span className="text-xs text-muted-foreground capitalize">{connectionStatus}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>}

      {/* Shelly Direct Control */}
      <Card>
        <CardHeader>
          <CardTitle>Shelly Pro 2</CardTitle>
          <CardDescription>
            Direct relay control as fallback when Pi is unreachable
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-chart-4/20">
                  <Plug className="size-4 text-chart-4" />
                </div>
                <div>
                  <Label htmlFor="shelly-ip" className="text-sm font-medium text-foreground">
                    Shelly IP
                  </Label>
                  <p className="text-xs text-muted-foreground">IP address of the Shelly Pro 2</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="shelly-ip"
                  type="text"
                  placeholder="192.168.1.x"
                  value={local.shellyIp}
                  onChange={(e) => setLocal((prev) => ({ ...prev, shellyIp: e.target.value }))}
                  className="max-w-[200px]"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestShelly}
                  disabled={!local.shellyIp || shellyTest === "testing"}
                >
                  {shellyTest === "testing" ? "Testing..." : "Test"}
                </Button>
              </div>
              {shellyTest !== "idle" && shellyTest !== "testing" && (
                <div className="flex items-center gap-1.5 text-xs">
                  {shellyTest === "success" ? (
                    <CheckCircle2 className="size-3.5 text-primary" />
                  ) : (
                    <XCircle className="size-3.5 text-destructive" />
                  )}
                  <span className={shellyTest === "success" ? "text-primary" : "text-destructive"}>
                    {shellyTestMsg}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-accent/30 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Enable Direct Control</p>
                <p className="text-xs text-muted-foreground">
                  Fallback to direct Shelly HTTP when Pi is offline
                </p>
              </div>
              <Switch
                checked={local.shellyDirectEnabled}
                onCheckedChange={(checked) =>
                  setLocal((prev) => ({ ...prev, shellyDirectEnabled: checked }))
                }
              />
            </div>

            {local.shellyDirectEnabled && local.shellyIp && (
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs text-muted-foreground">Manual test:</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={shellyDirectOn}
                >
                  <Power className="size-3.5 text-primary" />
                  ON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={shellyDirectOff}
                >
                  <Power className="size-3.5 text-destructive" />
                  OFF
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={!hasChanges && !saved}
          className="gap-2"
        >
          <Save className="size-4" />
          {saved ? "Saved" : "Save Settings"}
        </Button>
        {hasChanges && (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
      </div>
    </div>
  )
}
