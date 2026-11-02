"use client"

import { useEffect, useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function PasswordInput({ className, disabled, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!visible) return
    const hide = () => setVisible(false)
    const timer = window.setTimeout(hide, 5000)
    window.addEventListener("blur", hide)
    document.addEventListener("visibilitychange", hide)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("blur", hide)
      document.removeEventListener("visibilitychange", hide)
    }
  }, [visible])

  useEffect(() => {
    if (disabled) setVisible(false)
  }, [disabled])

  return (
    <div className="relative">
      <Input {...props} disabled={disabled} type={visible ? "text" : "password"} className={cn("pr-11", className)} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0 text-muted-foreground"
        disabled={disabled}
        aria-label={visible ? "Hide password" : "Show password for 5 seconds"}
        aria-pressed={visible}
        aria-controls={props.id}
        title={visible ? "Hide password" : "Show password for 5 seconds"}
        onClick={() => setVisible(current => !current)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  )
}
