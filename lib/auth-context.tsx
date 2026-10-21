"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { request } from "@/lib/api"
import { getApiBaseUrl } from "@/lib/settings"
import { clearAccessToken, setAccessToken } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface AuthUser {
  id: string; email: string; name: string
  status: "pending" | "active" | "rejected" | "suspended"
  role: "worker" | "sysadmin" | null
}
const AuthContext = createContext<{ user: AuthUser; logout: () => Promise<void> } | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [signup, setSignup] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [origin, setOrigin] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => { setOrigin(getApiBaseUrl().replace(/\/api$/, "")) }, [])
  useEffect(() => {
    const expired = () => { clearAccessToken(); setUser(null); setPassword(""); setNotice("Your session ended. Please sign in again.") }
    window.addEventListener("auth-expired", expired)
    return () => window.removeEventListener("auth-expired", expired)
  }, [])
  useEffect(() => {
    if (!user) return
    const check = () => { void request<AuthUser>("/auth/me").then(setUser).catch(() => {}) }
    const timer = setInterval(check, 15000)
    return () => clearInterval(timer)
  }, [!!user])

  const logout = async () => {
    // Retain the session if revocation fails, so Logout never falsely reports success.
    await request<void>("/auth/logout", { method: "POST" })
    clearAccessToken()
    setUser(null)
    setPassword("")
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true)
    try {
      const url = new URL(origin)
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) {
        throw new Error("Use an HTTPS server address. HTTP is allowed only on localhost.")
      }
      localStorage.setItem("dava-api-origin", url.origin)
      if (signup) {
        const result = await request<{message:string}>("/auth/signup", {method:"POST", body:JSON.stringify({email,name,password})})
        setNotice(result.message); setSignup(false); setPassword("")
      } else {
        const result = await request<{access_token:string; user:AuthUser}>("/auth/login", {method:"POST", body:JSON.stringify({email,password})})
        setAccessToken(result.access_token, getApiBaseUrl()); setUser(result.user); setPassword("")
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to connect") }
    finally { setBusy(false) }
  }

  if (user) return <AuthContext.Provider value={{user,logout}}>{children}</AuthContext.Provider>
  return (
    <main className="flex min-h-dvh items-center justify-center bg-page p-5">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-3xl font-bold">{signup ? "Request an account" : "Sign in to DAVA"}</h1>
        <p className="text-sm text-muted-foreground">{signup ? "An administrator must approve your account before you can sign in." : "Use your approved email and password."}</p>
        {signup && <div className="space-y-2"><Label htmlFor="auth-name">Name</Label><Input id="auth-name" autoComplete="name" value={name} onChange={e=>setName(e.target.value)} maxLength={100} required /></div>}
        <div className="space-y-2"><Label htmlFor="auth-email">Email</Label><Input id="auth-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required /></div>
        <div className="space-y-2"><Label htmlFor="auth-password">Password</Label><Input id="auth-password" type="password" autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={e=>setPassword(e.target.value)} minLength={signup ? 15 : 1} maxLength={128} required />{signup && <p className="text-xs text-muted-foreground">Use 15–128 characters. Spaces are welcome.</p>}</div>
        <details><summary className="cursor-pointer text-sm text-muted-foreground">Server connection</summary><Label className="mt-3" htmlFor="auth-server">Server address</Label><Input id="auth-server" type="url" value={origin} onChange={e=>setOrigin(e.target.value)} className="mt-2" /></details>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Please wait…" : signup ? "Request approval" : "Sign in"}</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={()=>{setSignup(!signup);setError("");setNotice("");setPassword("")}}>{signup ? "Back to sign in" : "Request an account"}</Button>
      </form>
    </main>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error("Authentication required")
  return value
}
