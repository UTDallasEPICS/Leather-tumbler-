"use client"
//This whole thing is for the settings page for ip stuff.
import { useState, useEffect } from "react"
import { Save, Server, Wifi, Plug, Power, CheckCircle2, XCircle, FlaskConical, Bell, BellRing, Send } from "lucide-react"
import { useDashboard } from "@/lib/dashboard-context"
import { getSettings, saveSettings, type Settings } from "@/lib/settings"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { requestPushPermission, addPushListeners, removePushListeners } from "@/lib/push-notifications"
import { getSendFcmUrl } from "@/lib/push-api"
import { sendLocalNotification } from "@/lib/local-notifications"
import { Capacitor } from "@capacitor/core"

type TestStatus = "idle" | "testing" | "success" | "error"

export function SettingsView() {
  const { connectionStatus, reconnect, shellyDirectOn, shellyDirectOff } = useDashboard()
  const [local, setLocal] = useState<Settings>(() => getSettings())
  const [saved, setSaved] = useState(false)
  const [shellyTest, setShellyTest] = useState<TestStatus>("idle")
  const [shellyTestMsg, setShellyTestMsg] = useState("")
  const [fcmToken, setFcmToken] = useState<string | null>(null)
  const [isPushRegistering, setIsPushRegistering] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)
  const { toast } = useToast()

  // Sync from localStorage on mount
  useEffect(() => {
    setLocal(getSettings())
    const savedToken = localStorage.getItem("fcm_token")
    if (savedToken) setFcmToken(savedToken)

    if (Capacitor.getPlatform() !== 'web') {
      addPushListeners(
        (token) => {
          setFcmToken(token)
          localStorage.setItem("fcm_token", token)
          toast({
            title: "Notifications Registered",
            description: "Your device is now ready to receive notifications.",
          })
        },
        (notification) => {
          toast({
            title: notification.title || "New Notification",
            description: notification.body || "You have a new message.",
          })
        },
        (action) => {
          toast({
            title: "Notification Clicked",
            description: `You opened: ${action.notification.title}`,
          })
        }
      )
    }

    return () => {
      removePushListeners()
    }
  }, [toast])

  const handleRegisterPush = async () => {
    setIsPushRegistering(true)
    try {
      await requestPushPermission()
    } catch (error: any) {
      toast({
        title: "Permission Denied",
        description: error.message || "Failed to register for notifications.",
        variant: "destructive",
      })
    } finally {
      setIsPushRegistering(false)
    }
  }

  const handleSendTestNotification = async () => {
    if (!fcmToken && Capacitor.getPlatform() === "web") return
    const sendUrl = getSendFcmUrl()
    if (!sendUrl) {
      await sendLocalNotification("Tumbler Notification", "Local test notification (APK mode)")
      toast({
        title: "Local test sent",
        description: "Push API not configured, so a local notification was used.",
      })
      return
    }
    setIsSendingTest(true)
    try {
      const resp = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: fcmToken,
          message: "This is a test notification from the Leather Tumbler app!",
        }),
      })
      const data = await resp.json()
      if (data.success) {
        toast({
          title: "Test Sent",
          description: "Check your notifications!",
        })
      } else {
        throw new Error(data.error || "Push API responded with an error.")
      }
    } catch (error: any) {
      toast({
        title: "Test Failed",
        description: error.message || "Could not send test notification.",
        variant: "destructive",
      })
    } finally {
      setIsSendingTest(false)
    }
  }

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

      {/* Server Connection */}
      <Card>
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

            <div className="flex items-center gap-2 px-1">
              <div className={cn("size-2.5 rounded-full", connectionDot)} />
              <span className="text-xs text-muted-foreground capitalize">{connectionStatus}</span>
            </div>
          </div>
        </CardContent>
      </Card>

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

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Stay updated with real-time status alerts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-chart-5/20">
                  <Bell className="size-4 text-chart-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Status</p>
                  <p className="text-xs text-muted-foreground">
                    {fcmToken ? "Registered for push notifications" : "Not registered"}
                  </p>
                </div>
                <Button
                  variant={fcmToken ? "outline" : "default"}
                  size="sm"
                  onClick={handleRegisterPush}
                  disabled={isPushRegistering}
                  className="gap-2"
                >
                  {fcmToken ? (
                    <>
                      <BellRing className="size-4" />
                      Re-register
                    </>
                  ) : (
                    <>
                      <Bell className="size-4" />
                      Enable
                    </>
                  )}
                </Button>
              </div>
              
              {fcmToken && (
                <div className="mt-2 pt-4 border-t border-border">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-md bg-primary/20">
                        <Send className="size-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Test Notifications</p>
                        <p className="text-xs text-muted-foreground">Send a test message to this device</p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleSendTestNotification}
                      disabled={isSendingTest}
                      className="gap-2"
                    >
                      {isSendingTest ? "Sending..." : "Test Push"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
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
