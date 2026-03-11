'use client'
import { useEffect, useState } from 'react'
import TempChart from '@/components/TempChart'
import StatsBar from '@/components/StatsBar'
import LogPanel from '@/components/LogPanel'
import TumblerControls from '@/components/TumblerControls'

const API = process.env.NEXT_PUBLIC_TUMBLER_API_URL

type Reading = { id: number; celsius: number; timestamp: string }
type Stats = { min_temp: number; max_temp: number; avg_temp: number; total_readings: number }
type Log = { id: number; level: string; message: string; timestamp: string }

export default function Dashboard() {
  const [latest, setLatest] = useState<Reading | null>(null)
  const [history, setHistory] = useState<Reading[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [logs, setLogs] = useState<Log[]>([])

  const fetchAll = async () => {
    const [lat, hist, st, lg] = await Promise.all([
      fetch(`${API}/temperature/latest`).then((r) => r.json()),
      fetch(`${API}/temperature/history?limit=60`).then((r) => r.json()),
      fetch(`${API}/temperature/stats`).then((r) => r.json()),
      fetch(`${API}/logs?limit=100`).then((r) => r.json()),
    ])
    setLatest(lat)
    setHistory(hist)
    setStats(st)
    setLogs(lg)
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 10000)
    return () => clearInterval(interval)
  }, [])

  const tempColor =
    latest?.celsius && latest.celsius >= 40
      ? 'text-red-500'
      : latest?.celsius && latest.celsius >= 30
      ? 'text-orange-400'
      : 'text-blue-500'

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">🌡️ Temperature Monitor</h1>
        <span className="text-sm text-gray-400">Auto-refreshes every 10s</span>
      </div>

      {/* Live reading */}
      {latest && (
        <div className="bg-white rounded-2xl shadow p-6 flex items-center gap-6">
          <div className={`text-6xl font-mono font-bold ${tempColor}`}>
            {latest.celsius?.toFixed(2)}°C
          </div>
          <div className="text-sm text-gray-400">
            <p>Last reading</p>
            <p>{new Date(latest.timestamp).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && <StatsBar stats={stats} />}

      {/* Chart */}
      <TempChart data={history} />

      {/* Tumbler Controls */}
      <TumblerControls />

      {/* Logs */}
      <LogPanel logs={logs} />
    </div>
  )
}
