"use client"

import { useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"
import { useDashboard } from "@/lib/dashboard-context"
import { getApiBaseUrl, getSettings, saveSettings } from "@/lib/settings"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { PageTitle, Sub } from "@/components/tumbler/parts"

export function SettingsView() {
  const { connectionStatus, reconnect } = useDashboard()
  const [demo, setDemo] = useState(getSettings().demoMode)
  const [saved, setSaved] = useState(false)
  return <div className="space-y-5">
    <div><PageTitle>Connection</PageTitle><Sub>Manage your connection and simulated readings.</Sub></div>
    <Card><CardHeader><CardTitle>Server</CardTitle><CardDescription>Authenticated DAVA service</CardDescription></CardHeader>
      <CardContent className="space-y-3"><p className="break-all text-sm">{getApiBaseUrl().replace(/\/api$/, "")}</p><p className="text-sm capitalize">{connectionStatus}</p><p className="text-sm text-muted-foreground">To change servers, sign out and open Server connection on the sign-in page.</p><Button variant="outline" onClick={reconnect}>Reconnect</Button></CardContent>
    </Card>
    <Card><CardHeader><CardTitle>Demo mode</CardTitle><CardDescription>Show simulated readings after signing in. Demo controls do not operate the tumbler.</CardDescription></CardHeader>
      <CardContent className="space-y-4"><div className="flex items-center justify-between"><Label htmlFor="demo-mode">Use simulated readings</Label><Switch id="demo-mode" checked={demo} onCheckedChange={value=>{setDemo(value);setSaved(false)}} /></div><Button onClick={()=>{saveSettings({...getSettings(),demoMode:demo,shellyDirectEnabled:false});reconnect();setSaved(true)}}>Save connection settings</Button>{saved && <p role="status" className="text-sm text-muted-foreground">Settings saved.</p>}</CardContent>
    </Card>
    <InspectionServerCard />
  </div>
}

/** Where the leather defect model runs (vision/service.py): a laptop or mini PC on the same Wi-Fi. */
function InspectionServerCard() {
  const [ip, setIp] = useState(getSettings().visionIp)
  const [port, setPort] = useState(String(getSettings().visionPort))
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const portNum = Number(port)
  const valid = ip.trim() !== "" && Number.isInteger(portNum) && portNum > 0 && portNum < 65536

  async function runTest() {
    setTesting(true)
    setTest(null)
    try {
      const resp = await fetch(`http://${ip.trim()}:${portNum}/api/vision/status`, { signal: AbortSignal.timeout(5000) })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const s = await resp.json()
      setTest(s.ready ? { ok: true, msg: `Model ready · ${s.counts?.total ?? 0} photos stored` } : { ok: false, msg: "Running, but no model loaded" })
    } catch (e) {
      setTest({ ok: false, msg: e instanceof Error && e.message.startsWith("HTTP") ? e.message : "Unreachable" })
    } finally {
      setTesting(false)
    }
  }

  return <Card>
    <CardHeader><CardTitle>Inspection server</CardTitle><CardDescription>Laptop or mini PC running the leather defect model (vision/service.py). Used by the Inspection page.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      <Label htmlFor="vision-ip">Address and port</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id="vision-ip" placeholder="192.168.1.x" value={ip} onChange={e=>{setIp(e.target.value);setSaved(false);setTest(null)}} className="max-w-[200px]" />
        <Input aria-label="Inspection server port" type="number" value={port} onChange={e=>{setPort(e.target.value);setSaved(false);setTest(null)}} className="w-[96px] tabular-nums" />
        <Button variant="outline" onClick={runTest} disabled={!valid || testing}>{testing ? "Testing…" : "Test"}</Button>
      </div>
      {test && <p role="status" className={`flex items-center gap-1.5 text-sm ${test.ok ? "text-primary" : "text-destructive"}`}>{test.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}{test.msg}</p>}
      <Button onClick={()=>{saveSettings({...getSettings(),visionIp:ip.trim(),visionPort:portNum});setSaved(true)}} disabled={!valid}>Save inspection server</Button>
      {saved && <p role="status" className="text-sm text-muted-foreground">Settings saved.</p>}
    </CardContent>
  </Card>
}
