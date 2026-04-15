"use client"

import { useEffect, useState } from "react"
import { KeyRound, Save, Smartphone } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { getStoredPin, isValidPin, updateStoredPin } from "@/lib/pin-auth"
import { sendRecoveryRequest } from "@/lib/pin-recovery-client"

export function AccountView() {
  const [oldPin, setOldPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [recoveryPhone, setRecoveryPhone] = useState("")
  const [recoveryStatus, setRecoveryStatus] = useState("")
  const [isSavingPhone, setIsSavingPhone] = useState(false)
  const [isLoadingPhone, setIsLoadingPhone] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const clearFeedback = () => {
    setError("")
    setSuccess("")
  }

  useEffect(() => {
    const loadRecoveryPhone = async () => {
      try {
        setIsLoadingPhone(true)
        const response = await sendRecoveryRequest("get_recovery_phone", {})
        if (response.success && typeof response.phone === "string") {
          setRecoveryPhone(response.phone)
        }
      } catch {
        setRecoveryStatus("Could not load recovery phone from server.")
      } finally {
        setIsLoadingPhone(false)
      }
    }

    void loadRecoveryPhone()
  }, [])

  const handleSavePin = () => {
    clearFeedback()

    if (!isValidPin(oldPin) || !isValidPin(newPin) || !isValidPin(confirmPin)) {
      setError("Each PIN must be exactly 4 digits.")
      return
    }

    if (oldPin !== getStoredPin()) {
      setError("Incorrect old PIN.")
      return
    }

    if (newPin !== confirmPin) {
      setError("New PIN entries do not match.")
      return
    }

    if (newPin === oldPin) {
      setError("New PIN must be different from old PIN.")
      return
    }

    updateStoredPin(newPin)
    setOldPin("")
    setNewPin("")
    setConfirmPin("")
    setSuccess("PIN changed successfully.")
  }

  const handleSaveRecoveryPhone = async () => {
    setRecoveryStatus("")
    const normalized = recoveryPhone.trim()
    if (!normalized) {
      setRecoveryStatus("Enter a phone number first.")
      return
    }

    setIsSavingPhone(true)
    try {
      const response = await sendRecoveryRequest("register_recovery_phone", { phone: normalized })
      if (response.success) {
        const returnedPhone = typeof response.phone === "string" ? response.phone : normalized
        setRecoveryPhone(returnedPhone)
        setRecoveryStatus("Recovery phone registered.")
      } else {
        setRecoveryStatus((response.message as string) || "Failed to register phone.")
      }
    } catch (err) {
      setRecoveryStatus(err instanceof Error ? err.message : "Failed to register phone.")
    } finally {
      setIsSavingPhone(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground">Manage app access PIN</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-4" />
            Recovery Phone
          </CardTitle>
          <CardDescription>
            Register the SMS number allowed to request Forgot PIN OTP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recovery-phone">Phone Number</Label>
            <Input
              id="recovery-phone"
              type="tel"
              placeholder="+1 (469) 996 6569 or +52 55 1234 5678"
              value={recoveryPhone}
              onChange={(e) => setRecoveryPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use full international format with country code.
            </p>
          </div>
          {recoveryStatus && <p className="text-sm text-muted-foreground">{recoveryStatus}</p>}
          <Button className="gap-2" onClick={handleSaveRecoveryPhone} disabled={isSavingPhone || isLoadingPhone}>
            <Save className="size-4" />
            {isSavingPhone ? "Saving..." : "Save Recovery Phone"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            Change PIN
          </CardTitle>
          <CardDescription>
            Enter old PIN, choose a new 4-digit PIN, and confirm it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="old-pin">Old PIN</Label>
            <Input
              id="old-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="Enter old PIN"
              value={oldPin}
              onChange={(e) => {
                clearFeedback()
                setOldPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-pin">New PIN</Label>
            <Input
              id="new-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="Enter new PIN"
              value={newPin}
              onChange={(e) => {
                clearFeedback()
                setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-pin">Retype New PIN</Label>
            <Input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="Retype new PIN"
              value={confirmPin}
              onChange={(e) => {
                clearFeedback()
                setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSavePin()
              }}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">{success}</p>}

          <Button className="gap-2" onClick={handleSavePin}>
            <Save className="size-4" />
            Update PIN
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
