"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { MobileSidebar } from "@/components/mobile-sidebar"
import { OfflineBackground } from "@/components/offline-background"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DEFAULT_PIN, getStoredPin, isValidPin, updateStoredPin, verifyPin } from "@/lib/pin-auth"
import { requestPinResetOtp, verifyPinResetOtp } from "@/lib/api"

function PinLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pinInput, setPinInput] = useState("")
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [flow, setFlow] = useState<"pin" | "forgot">("pin")
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localMockOtp, setLocalMockOtp] = useState<string | null>(null)

  const handleUnlock = () => {
    if (verifyPin(pinInput)) {
      setError("")
      setInfo("")
      setPinInput("")
      onUnlock()
      return
    }
    setError("Incorrect PIN")
  }

  const handleRequestOtp = async () => {
    setError("")
    setInfo("")
    if (!phone.trim()) {
      setError("Enter registered phone number.")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await requestPinResetOtp(phone.trim())
      if (!response.success) {
        setError(response.message || "Failed to send OTP.")
        return
      }
      setLocalMockOtp(null)
      const delivery = response.delivery || "sms"
      if (delivery === "mock" && typeof response.debugCode === "string") {
        setInfo(`SMS provider not configured. Test OTP: ${response.debugCode}`)
      } else {
        setInfo("OTP sent by SMS. Enter it below.")
      }
    } catch (err) {
      // Software-only fallback: generate local OTP when backend is unreachable.
      const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")
      setLocalMockOtp(code)
      setInfo(`Backend unavailable. Local mock OTP: ${code}`)
      setError("")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetPin = async () => {
    setError("")
    setInfo("")

    if (!phone.trim() || !otp.trim()) {
      setError("Phone and OTP are required.")
      return
    }
    if (!isValidPin(newPin) || !isValidPin(confirmPin)) {
      setError("New PIN must be exactly 4 digits.")
      return
    }
    if (newPin !== confirmPin) {
      setError("New PIN entries do not match.")
      return
    }

    setIsSubmitting(true)
    try {
      if (localMockOtp) {
        if (otp.trim() !== localMockOtp) {
          setError("Invalid local mock OTP.")
          return
        }
        updateStoredPin(newPin)
        setOtp("")
        setNewPin("")
        setConfirmPin("")
        setLocalMockOtp(null)
        setFlow("pin")
        setInfo("PIN reset successful using local mock OTP.")
        return
      }

      const response = await verifyPinResetOtp(phone.trim(), otp.trim())
      if (!response.success) {
        setError(response.message || "Invalid OTP.")
        return
      }
      updateStoredPin(newPin)
      setOtp("")
      setNewPin("")
      setConfirmPin("")
      setFlow("pin")
      setInfo("PIN reset successful. Use your new PIN to unlock.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify OTP.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
            <Image src="/icon-192.png" alt="DAVA logo" width={40} height={40} className="size-10 object-contain" />
          </div>
          <CardTitle>Enter PIN</CardTitle>
          <CardDescription>
            Unlock DAVA Leather Tumbler. Default PIN is {DEFAULT_PIN}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {flow === "pin" ? (
            <>
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="4-digit PIN"
                value={pinInput}
                onChange={(e) => {
                  setError("")
                  setInfo("")
                  setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUnlock()
                }}
              />
              <Button className="w-full" onClick={handleUnlock}>
                Unlock
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setError("")
                  setInfo("")
                  setFlow("forgot")
                }}
              >
                Forgot PIN?
              </Button>
            </>
          ) : (
            <>
              <Input
                type="tel"
                placeholder="Registered phone (+1 or +52)"
                value={phone}
                onChange={(e) => {
                  setError("")
                  setInfo("")
                  setPhone(e.target.value)
                }}
              />
              <Button className="w-full" onClick={handleRequestOtp} disabled={isSubmitting}>
                {isSubmitting ? "Sending OTP..." : "Send OTP"}
              </Button>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter OTP"
                value={otp}
                onChange={(e) => {
                  setError("")
                  setInfo("")
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }}
              />
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="New 4-digit PIN"
                value={newPin}
                onChange={(e) => {
                  setError("")
                  setInfo("")
                  setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }}
              />
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="Confirm new PIN"
                value={confirmPin}
                onChange={(e) => {
                  setError("")
                  setInfo("")
                  setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }}
              />
              <Button className="w-full" onClick={handleResetPin} disabled={isSubmitting}>
                {isSubmitting ? "Verifying..." : "Verify OTP & Reset PIN"}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setError("")
                  setInfo("")
                  setFlow("pin")
                }}
              >
                Back to PIN
              </Button>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-muted-foreground">{info}</p>}
        </CardContent>
      </Card>
    </div>
  )
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)

  useEffect(() => {
    // Ensure a valid PIN exists and force auth gate on app load.
    getStoredPin()
    setIsReady(true)
    setIsUnlocked(false)
  }, [])

  if (!isReady) return null
  if (!isUnlocked) return <PinLockScreen onUnlock={() => setIsUnlocked(true)} />

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <MobileSidebar />
        <main className="relative flex-1 min-h-0 overflow-y-auto p-4 md:p-6 lg:p-8">
          <OfflineBackground />
          <div className="relative z-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
