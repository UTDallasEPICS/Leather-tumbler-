// The runs API that both tumbler servers implement: the ESP32 firmware (firmware/src/core/RunStore,
// firmware/src/net/ApiServer) and the legacy Python backend (backend/routers/runs.py).
//
// A run is one JSON document. The server stores it as it is, except for a few fields:
//   it reads   id (1-40 of A-Z a-z 0-9 _ -), tumblerId, status, stageId (the current stage, null once
//              the stages are done), startedAt, endedAt
//   it owns    rev        +1 on every accepted write; a PUT must name the rev it was based on
//              seq        one counter across all runs, +1 on every change (also sensor updates)
//              updatedAt  server time (ms) of the last change
//              sensors    per-stage totals of the readings taken while the drum turned
//   Whatever the app sends for rev, seq, updatedAt or sensors is ignored.
//
//   GET  /api/runs?since=<seq>&limit=<n>  200 { seq, more, serverNow, runs }   runs changed after `since`, oldest
//                                                change first; `seq` is the last change covered, and `more` says
//                                                to ask again from it
//   POST /api/runs             { run }           201 { run, serverNow }
//                                                409 { error: "active_run" | "exists", run, serverNow }
//   PUT  /api/runs/<id>        { run, baseRev }  200 { run, serverNow }
//                                                409 { error: "stale" | "final", run, serverNow }   404 { error: "not_found" }
//   POST /api/runs/<id>/override { reason }      200 { run, serverNow }   409 { error: "final", run, serverNow }   (for tools; the app overrides with a PUT)
//   POST /api/runs/import      { runs }          200 { imported, skipped, seq, serverNow }
//   GET  /api/system/info                        { controllerId, ... }
//   WS   { type: "run_updated", id, rev, seq }   after every change
//   A malformed request gets a 4xx (413 for a body over 32 KB on the ESP32, 16 KB on the Python backend);
//   a 5xx means try again later. The Python backend also wants the signed-in session (401 without it).
//   Times are milliseconds since 1970.
//
// Rules: a tumbler has at most one active run (an imported active run that clashes is stored as
// overridden). A POST must be an active run; a run started and finished offline arrives through
// /import. Completed and overridden runs are final. Readings are added to the active run's
// current stage while the drum is running. The server keeps the active run and the newest 200
// finished runs.

import { RECIPE } from "@/lib/recipe"
import { getAccessToken } from "@/lib/session"
import { getApiBaseUrl } from "@/lib/settings"
import type { Run } from "@/lib/runs"

export interface RunsPage {
  seq: number
  more?: boolean
  serverNow: number
  runs: Run[]
}

export type WriteResult =
  | { ok: true; run: Run; serverNow: number }
  | { ok: false; status: number; error?: string; run?: Run; serverNow?: number }

const TIMEOUT_MS = 15_000

/** Like request() in lib/api.ts (the signed-in session, and signing out when it has expired), but it
 * hands back the status and body of a refusal, which the sync needs. */
async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const token = getAccessToken(getApiBaseUrl())
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (response.status === 401 && token) window.dispatchEvent(new Event("auth-expired"))
  const body = await response.json().catch(() => ({}))
  return { status: response.status, body }
}

const asWrite = ({ status, body }: { status: number; body: any }): WriteResult =>
  status >= 200 && status < 300
    ? { ok: true, run: body.run, serverNow: body.serverNow }
    : { ok: false, status, error: body.error, run: body.run, serverNow: body.serverNow }

/** The run as sent: fields from older versions of the app dropped, the current stage spelled out for the server. */
export function toWire(run: Run): Run {
  const { alert: _alert, tipsShown: _tips, ...rest } = run as Run & { alert?: unknown; tipsShown?: unknown }
  return { ...rest, stageId: RECIPE.stages[run.stage]?.id ?? null }
}

export async function fetchRuns(since: number): Promise<RunsPage> {
  const { status, body } = await call(`/runs?since=${since}`)
  if (status !== 200) throw new Error(`GET /runs failed (${status})`)
  return body as RunsPage
}

export async function createRun(run: Run): Promise<WriteResult> {
  return asWrite(await call("/runs", { method: "POST", body: JSON.stringify({ run: toWire(run) }) }))
}

export async function saveRun(run: Run, baseRev: number): Promise<WriteResult> {
  return asWrite(await call(`/runs/${run.id}`, { method: "PUT", body: JSON.stringify({ run: toWire(run), baseRev }) }))
}

export async function overrideRun(id: string, reason: string): Promise<WriteResult> {
  return asWrite(await call(`/runs/${id}/override`, { method: "POST", body: JSON.stringify({ reason }) }))
}

/** The Python backend takes request bodies up to 16 KB (the ESP32 32 KB), so imports go a few runs at a time. */
const MAX_BODY_CHARS = 12_000

export async function importRuns(runs: Run[]): Promise<{ imported: string[]; skipped: string[]; seq: number; serverNow?: number }> {
  const out = { imported: [] as string[], skipped: [] as string[], seq: 0, serverNow: undefined as number | undefined }
  const batches: Run[][] = [[]]
  let size = 0
  for (const run of runs.map(toWire)) {
    const n = JSON.stringify(run).length
    if (size + n > MAX_BODY_CHARS && batches.at(-1)!.length) {
      batches.push([])
      size = 0
    }
    batches.at(-1)!.push(run)
    size += n
  }
  for (const batch of batches) {
    if (!batch.length) continue
    const { status, body } = await call("/runs/import", { method: "POST", body: JSON.stringify({ runs: batch }) })
    // a single run too big to send can never be imported; don't let it hold up the rest
    if (status === 413 && batch.length === 1) {
      out.skipped.push(batch[0].id)
      continue
    }
    if (status !== 200) throw new Error(`POST /runs/import failed (${status})`)
    out.imported.push(...body.imported)
    out.skipped.push(...body.skipped)
    out.seq = body.seq
    out.serverNow = body.serverNow
  }
  return out
}

/** Which controller this is, so a different one's runs are never mixed into the cache. */
export async function fetchControllerId(): Promise<string | null> {
  const { status, body } = await call("/system/info")
  return status === 200 && typeof body.controllerId === "string" ? body.controllerId : null
}
