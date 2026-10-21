"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth, type AuthUser } from "@/lib/auth-context"
import { request } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { PageTitle, Sub } from "@/components/tumbler/parts"

interface Audit { id:number; actor_id:string|null; target_id:string; action:string; before_state:string; after_state:string; created_at:number }

export function AccountView() {
  const { user, logout } = useAuth()
  const [users,setUsers] = useState<AuthUser[]>([])
  const [audit,setAudit] = useState<Audit[]>([])
  const [error,setError] = useState("")
  const [busy,setBusy] = useState(false)
  const refresh = useCallback(async () => {
    if (user.role !== "sysadmin") { setUsers([]); setAudit([]); return }
    const [accounts,events] = await Promise.all([request<AuthUser[]>("/admin/users"),request<Audit[]>("/admin/audit")])
    setUsers(accounts); setAudit(events)
  },[user.role])
  useEffect(()=>{void refresh().catch(err=>setError(err.message))},[refresh])
  const change = async (account:AuthUser, action:string, body?:object) => {
    setBusy(true); setError("")
    try {
      await request(`/admin/users/${account.id}/${action}`,{method:["role","status"].includes(action)?"PATCH":"POST", ...(body ? {body:JSON.stringify(body)} : {})})
      await refresh()
    } catch(err) {setError(err instanceof Error?err.message:"Request failed")}
    finally {setBusy(false)}
  }
  return <div className="space-y-5">
    <div><PageTitle>Account</PageTitle><Sub>{user.name} · {user.email}</Sub><p className="mt-2 text-sm capitalize">{user.role}</p></div>
    <Button variant="outline" onClick={()=>{void logout().catch(err=>setError(err.message))}}>Sign out</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {user.role === "sysadmin" && <>
      <div className="flex items-center justify-between"><h2 className="font-display text-xl font-bold">Account approvals</h2><Button variant="ghost" onClick={()=>{void refresh().catch(err=>setError(err.message))}}>Refresh</Button></div>
      <p className="text-sm text-muted-foreground">Review the applicant’s identity before assigning access. Pending and rejected accounts cannot sign in.</p>
      {users.map(account=><section key={account.id} className="space-y-3 rounded-xl border border-border p-4">
        <div><h3 className="font-semibold">{account.name}</h3><p className="break-all text-sm text-muted-foreground">{account.email}</p><p className="mt-1 text-xs capitalize">{account.status}{account.role ? ` · ${account.role}` : ""}</p></div>
        {account.status === "pending" ? <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={()=>change(account,"approve",{role:"worker"})}>Approve as worker</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>change(account,"approve",{role:"sysadmin"})}>Approve as sysadmin</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>change(account,"reject")}>Reject</Button>
        </div> : ["active","suspended"].includes(account.status) && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>change(account,"role",{role:account.role==="worker"?"sysadmin":"worker"})}>Make {account.role==="worker"?"sysadmin":"worker"}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>change(account,"status",{status:account.status==="active"?"suspended":"active"})}>{account.status==="active"?"Suspend":"Reactivate"}</Button>
        </div>}
      </section>)}
      <h2 className="font-display text-xl font-bold">Access audit</h2>
      <div className="max-h-80 overflow-y-auto space-y-3 rounded-xl border border-border p-4">{audit.map(event=><div key={event.id} className="border-b border-border pb-3 text-xs">
        <p className="font-semibold">{event.action.replaceAll("_"," ")} · {new Date(event.created_at*1000).toLocaleString()}</p>
        <p className="break-all text-muted-foreground">Actor: {event.actor_id ?? "Local bootstrap / signup"}<br/>Account: {event.target_id}</p>
        <p className="break-all">{event.before_state} → {event.after_state}</p>
      </div>)}</div>
    </>}
  </div>
}
