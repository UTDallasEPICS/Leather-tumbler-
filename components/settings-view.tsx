"use client"

import { useState } from "react"
import { useDashboard } from "@/lib/dashboard-context"
import { getApiBaseUrl, getSettings, saveSettings } from "@/lib/settings"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  </div>
}
