// Real runs, shared through the tumbler's controller (the API is in lib/runs-api.ts).
//
// The controller's copy of a run is the truth. What a person does on this device is kept as a list of
// changes waiting to be sent (RunOp, see lib/runs.tsx), and the app shows the controller's copy with
// those changes made on top. When the controller has a newer copy, because another device saved first
// or this one was offline, the same changes are made again on top of that copy and sent again, so
// neither device's work is lost. Copies and unsent changes are cached in this browser, so the app opens
// straight away and keeps working while the controller can't be reached.

import { createRun, fetchControllerId, fetchRuns, importRuns, saveRun } from "@/lib/runs-api"
import type { Run, RunOp } from "@/lib/runs"

export interface Pending {
  id: string
  runId: string
  /** when it was done, in controller time */
  at: number
  op: RunOp
}

export interface Notice {
  id: string
  tumblerId: number
  text: string
}

export interface SyncSnapshot {
  /** the controller this device keeps runs on; null until it has reached one that keeps them */
  controllerId: string | null
  /** the controller's copies with this device's unsent changes made on top */
  runs: Run[]
  online: boolean
  /** runs with changes not yet saved on the controller */
  pending: ReadonlySet<string>
  /** when (device time) a run last changed on another device */
  remoteAt: Readonly<Record<string, number>>
  notices: readonly Notice[]
}

/** Makes a run's unsent changes on top of a copy of it (or, for a run not on the controller yet, from nothing). */
export type ApplyChanges = (run: Run | undefined, changes: Pending[]) => Run | undefined

interface Cache {
  controllerId: string | null
  /** the last change this device has fetched */
  seq: number
  runs: Record<string, Run>
  /** controller time minus device time */
  offset: number
}

const CACHE_KEY = "dava-runs-sync-v1"
const OUTBOX_KEY = "dava-runs-outbox-v1"
const FINISHED_KEPT = 200
const RETRY_MS = 15_000
const PULL_EVERY_MS = 60_000
/** a server time before this means the controller's clock hasn't been set */
const SANE_TIME = 1_700_000_000_000

let offset = 0
/** Now, in the controller's time, so every device stamps timers and counts them down the same. */
export const clockNow = () => Date.now() + offset

const emptyCache = (controllerId: string | null = null): Cache => ({ controllerId, seq: 0, runs: {}, offset: 0 })
const newId = () => Math.random().toString(36).slice(2, 10)

export const EMPTY_SNAPSHOT: SyncSnapshot = { controllerId: null, runs: [], online: false, pending: new Set(), remoteAt: {}, notices: [] }

export class RunSync {
  private cache: Cache = emptyCache()
  private outbox: Pending[] = []
  private snap: SyncSnapshot = EMPTY_SNAPSHOT
  private listeners = new Set<() => void>()
  private online = false
  private remoteAt: Record<string, number> = {}
  private notices: Notice[] = []
  /** runs with a write on its way, so its echo isn't taken for another device's change */
  private sending = new Set<string>()
  private runsDirty = false
  private clockSet = false
  private flushing = false
  private refreshing = false
  private pulling: Promise<void> | null = null
  private pullAgain = false
  private lastPull = 0
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private apply: ApplyChanges) {}

  // ---- for React (useSyncExternalStore) ----

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
  getSnapshot = () => this.snap
  getServerSnapshot = () => EMPTY_SNAPSHOT

  // ---- what the app calls ----

  load = () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const c = JSON.parse(raw) as Partial<Cache>
        this.cache = { ...emptyCache(c.controllerId ?? null), seq: c.seq ?? 0, runs: c.runs ?? {}, offset: c.offset ?? 0 }
      }
      const ob = localStorage.getItem(OUTBOX_KEY)
      if (ob) {
        const o = JSON.parse(ob) as { controllerId: string | null; outbox: Pending[] }
        if (o.controllerId === this.cache.controllerId && Array.isArray(o.outbox)) this.outbox = o.outbox
      }
    } catch {
      // unreadable storage: start from the controller's copy
    }
    offset = this.cache.offset
    this.changed()
  }

  /** Keeps in step with the controller while real runs are in use (Demo Mode off). */
  start = () => {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (!this.online || this.outbox.length || Date.now() - this.lastPull > PULL_EVERY_MS) void this.refresh()
    }, RETRY_MS)
    document.addEventListener("visibilitychange", this.onVisible)
    void this.refresh()
  }

  stop = () => {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    document.removeEventListener("visibilitychange", this.onVisible)
  }

  /** Records a change to a run, shows it at once and sends it when the controller can be reached. */
  dispatch = (runId: string, op: RunOp, at: number) => {
    if (op.type === "create" && this.snap.runs.some((r) => r.tumblerId === op.run.tumblerId && r.status === "active")) return
    this.outbox.push({ id: newId(), runId, at, op })
    this.saveOutbox()
    this.changed()
    void this.flush()
  }

  /** Asks the controller who it is, then fetches what changed and sends what's waiting. */
  refresh = async () => {
    if (this.refreshing) return
    this.refreshing = true
    try {
      const id = await fetchControllerId()
      this.setOnline(true)
      // reachable, but its firmware doesn't keep runs: they stay on each device until it does
      if (!id) return
      if (this.cache.controllerId !== id) {
        // a device that had no controller yet adopts this one; a different controller starts afresh
        if (this.cache.controllerId) {
          this.cache = emptyCache(id)
          this.outbox = []
        } else this.cache.controllerId = id
        this.runsDirty = true
        this.commit()
      }
      await this.pull()
      await this.flush()
    } catch {
      this.setOnline(false)
    } finally {
      this.refreshing = false
    }
  }

  /** The controller announced a change (WebSocket run_updated). */
  remoteChanged = (seq: unknown) => {
    if (!this.timer || !this.cache.controllerId) return
    if (typeof seq === "number" && seq <= this.cache.seq) return
    void this.pull().catch(() => this.setOnline(false))
  }

  /** Sends runs kept on this device from before it reached this controller. True once they're stored there. */
  importLocal = async (runs: Run[]) => {
    if (!this.cache.controllerId || !runs.length) return false
    try {
      await this.timed(() => importRuns(runs))
      await this.pull()
      return true
    } catch {
      this.setOnline(false)
      return false
    }
  }

  dismiss = (noticeId: string) => {
    this.notices = this.notices.filter((n) => n.id !== noticeId)
    this.changed()
  }

  // ---- talking to the controller ----

  private pull(): Promise<void> {
    if (this.pulling) {
      this.pullAgain = true
      return this.pulling
    }
    this.pulling = (async () => {
      try {
        let more = true
        while (more || this.pullAgain) {
          this.pullAgain = false
          const page = await this.timed(() => fetchRuns(this.cache.seq))
          for (const run of page.runs) this.keep(run, true)
          more = !!page.more && page.seq > this.cache.seq
          this.cache.seq = Math.max(this.cache.seq, page.seq)
          this.runsDirty = true
          this.lastPull = Date.now()
          this.setOnline(true)
          this.trim()
          this.commit()
        }
      } finally {
        this.pulling = null
      }
    })()
    return this.pulling
  }

  private async flush() {
    if (this.flushing || !this.cache.controllerId) return
    this.flushing = true
    try {
      // each pass sends one run's waiting changes; a conflict comes round again on the newer copy
      for (let pass = 0; pass < 20 && this.outbox.length; pass++) {
        const runId = this.outbox[0].runId
        const changes = this.outbox.filter((p) => p.runId === runId)
        const base = this.cache.runs[runId]
        const doc = this.apply(base, changes)
        if (!doc) {
          this.drop(changes)
          continue
        }

        // started and finished while offline: a POST only takes active runs
        if (!base && doc.status !== "active") {
          await this.timed(() => importRuns([doc]))
          this.drop(changes)
          await this.pull()
          continue
        }

        this.sending.add(runId)
        const res = await this.timed(() => (base ? saveRun(doc, base.rev ?? 0) : createRun(doc))).finally(() => this.sending.delete(runId))
        // the controller is having trouble (storage full, say): keep the changes and try again later
        if (!res.ok && res.status >= 500) throw new Error(`Saving run ${runId} failed (${res.status})`)
        this.setOnline(true)
        if (res.ok) {
          this.keep(res.run)
          this.drop(changes)
          this.commit()
          continue
        }
        if (res.run) this.keep(res.run)
        switch (res.error) {
          case "stale": // another device saved first
          case "exists": // an earlier attempt got through after all: the rest is a save
            break
          case "final":
            this.dropRun(runId)
            this.notify(doc.tumblerId, `Run #${doc.number} was finished on another device, so the last changes made here weren't saved.`)
            break
          case "active_run": {
            // started here while offline, but another device started one first: keep this one as overridden
            const theirs = res.run ? `run #${res.run.number}` : "a run"
            await this.timed(() =>
              importRuns([{ ...doc, status: "overridden", endedAt: clockNow(), overrideReason: "Started on another device while offline" }]),
            )
            this.dropRun(runId)
            this.notify(
              doc.tumblerId,
              `This device started a run while offline, but another device had already started ${theirs}. The one from this device is kept in the history as overridden.`,
            )
            await this.pull()
            break
          }
          case "not_found":
            // the controller lost it (reset or replaced): an active run goes back as new
            delete this.cache.runs[runId]
            this.runsDirty = true
            this.dropRun(runId)
            if (doc.status === "active") this.outbox.unshift({ id: newId(), runId, at: clockNow(), op: { type: "create", run: doc } })
            break
          default:
            // refused as malformed: sending it again won't help
            console.error(`Run ${runId} was refused (${res.status} ${res.error ?? ""})`)
            this.dropRun(runId)
        }
        this.commit()
      }
    } catch {
      this.setOnline(false)
    } finally {
      this.flushing = false
    }
  }

  /** Runs a request and keeps the clock offset from its serverNow. */
  private async timed<T extends { serverNow?: number }>(fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now()
    const res = await fn()
    const t1 = Date.now()
    const serverNow = res.serverNow
    if (serverNow && serverNow > SANE_TIME && t1 - t0 < 2000) {
      const next = Math.round(serverNow - (t0 + t1) / 2)
      // ignore jitter, so countdowns don't twitch
      if (!this.clockSet || Math.abs(next - offset) > 1000) {
        offset = next
        this.cache.offset = next
        this.runsDirty = true
      }
      this.clockSet = true
    }
    return res
  }

  // ---- local state ----

  /** Takes a copy from the controller unless a newer one is already here. */
  private keep(run: Run, fromPull = false) {
    const cur = this.cache.runs[run.id]
    if (cur && (cur.seq ?? 0) >= (run.seq ?? 0)) return
    if (fromPull && cur && (run.rev ?? 0) > (cur.rev ?? 0) && !this.sending.has(run.id)) this.remoteAt[run.id] = Date.now()
    this.cache.runs[run.id] = run
    this.runsDirty = true
  }

  /** The active runs and the newest finished ones, like the controller keeps. */
  private trim() {
    const finished = Object.values(this.cache.runs)
      .filter((r) => r.status !== "active" && !this.outbox.some((p) => p.runId === r.id))
      .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
    for (const r of finished.slice(FINISHED_KEPT)) delete this.cache.runs[r.id]
  }

  private drop(changes: Pending[]) {
    const ids = new Set(changes.map((p) => p.id))
    this.outbox = this.outbox.filter((p) => !ids.has(p.id))
    this.saveOutbox()
  }

  private dropRun(runId: string) {
    this.outbox = this.outbox.filter((p) => p.runId !== runId)
    this.saveOutbox()
  }

  private notify(tumblerId: number, text: string) {
    this.notices = [...this.notices, { id: newId(), tumblerId, text }]
  }

  private setOnline(online: boolean) {
    if (this.online === online) return
    this.online = online
    this.changed()
  }

  private onVisible = () => {
    if (document.visibilityState === "visible") void this.refresh()
  }

  private commit() {
    if (this.runsDirty) {
      this.runsDirty = false
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache))
      } catch {
        // storage full or blocked: the copies are fetched again next time
      }
    }
    this.changed()
  }

  private saveOutbox() {
    try {
      localStorage.setItem(OUTBOX_KEY, JSON.stringify({ controllerId: this.cache.controllerId, outbox: this.outbox }))
    } catch {
      // storage blocked: unsent changes only last until the page closes
    }
  }

  private changed() {
    const byRun = new Map<string, Pending[]>()
    for (const p of this.outbox) byRun.set(p.runId, [...(byRun.get(p.runId) ?? []), p])
    const runs: Run[] = []
    for (const run of Object.values(this.cache.runs)) {
      const changes = byRun.get(run.id)
      const shown = changes ? this.apply(run, changes) : run
      if (shown) runs.push(shown)
    }
    for (const [runId, changes] of byRun) {
      if (this.cache.runs[runId]) continue
      const shown = this.apply(undefined, changes)
      if (shown) runs.push(shown)
    }
    this.snap = {
      controllerId: this.cache.controllerId,
      runs,
      online: this.online,
      pending: new Set(byRun.keys()),
      remoteAt: { ...this.remoteAt },
      notices: this.notices,
    }
    for (const fn of this.listeners) fn()
  }
}
