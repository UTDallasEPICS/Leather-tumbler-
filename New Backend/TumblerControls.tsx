'use client'
import { useEffect, useState, useCallback } from 'react'

const API = process.env.NEXT_PUBLIC_TUMBLER_API_URL

type SwitchState = Record<string, boolean>

const switchLabels: Record<string, string> = {
  rotation_fwd: 'Rotation ▶',
  rotation_rev: 'Rotation ◀',
  vibration: 'Vibration',
  water_pump: 'Water Pump',
}

const switchColors: Record<string, string> = {
  rotation_fwd: 'bg-blue-500 hover:bg-blue-600',
  rotation_rev: 'bg-purple-500 hover:bg-purple-600',
  vibration: 'bg-orange-500 hover:bg-orange-600',
  water_pump: 'bg-teal-500 hover:bg-teal-600',
}

const defaultColor = 'bg-gray-500 hover:bg-gray-600'

function formatLabel(id: string): string {
  return switchLabels[id] ?? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getColor(id: string): string {
  return switchColors[id] ?? defaultColor
}

export default function TumblerControls() {
  const [state, setState] = useState<SwitchState | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API}/tumbler/state`)
      if (!res.ok) throw new Error('Failed to fetch state')
      setState(await res.json())
      setError(null)
    } catch {
      setError('Cannot reach Pi API')
    }
  }, [])

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 5000)
    return () => clearInterval(interval)
  }, [fetchState])

  const toggle = async (switchId: string) => {
    if (!state) return
    const newState = !state[switchId]
    setLoading(switchId)
    try {
      const res = await fetch(`${API}/tumbler/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ switch_id: switchId, state: newState }),
      })
      if (!res.ok) throw new Error('Switch command failed')
      const data = await res.json()
      setState(data.state)
      setError(null)
    } catch {
      setError(`Failed to toggle ${formatLabel(switchId)}`)
    } finally {
      setLoading(null)
    }
  }

  const emergencyStop = async () => {
    setLoading('stop')
    try {
      const res = await fetch(`${API}/tumbler/stop`, { method: 'POST' })
      if (!res.ok) throw new Error('Stop failed')
      const data = await res.json()
      setState(data.state)
      setError(null)
    } catch {
      setError('Emergency stop failed!')
    } finally {
      setLoading(null)
    }
  }

  const anyOn = state ? Object.values(state).some(Boolean) : false

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Tumbler Controls</h2>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* Switch Toggles */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {state ? (
          Object.entries(state).map(([id, on]) => (
            <button
              key={id}
              onClick={() => toggle(id)}
              disabled={loading !== null}
              className={`
                relative rounded-xl px-4 py-3 text-sm font-medium text-white
                transition-all duration-150 flex items-center justify-between
                disabled:opacity-60
                ${on ? getColor(id) : 'bg-gray-200 hover:bg-gray-300 text-gray-600'}
              `}
            >
              <span>{formatLabel(id)}</span>
              <span className={`
                w-8 h-4 rounded-full flex items-center transition-colors duration-200
                ${on ? 'bg-white/30' : 'bg-gray-400/30'}
              `}>
                <span className={`
                  w-3 h-3 rounded-full bg-white shadow transition-transform duration-200 ml-0.5
                  ${on ? 'translate-x-4' : 'translate-x-0'}
                `} />
              </span>
              {loading === id && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-xl">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </span>
              )}
            </button>
          ))
        ) : (
          <p className="col-span-2 text-sm text-gray-400 text-center py-4">
            {error ? error : 'Loading switch state...'}
          </p>
        )}
      </div>

      {/* Emergency Stop */}
      <button
        onClick={emergencyStop}
        disabled={loading !== null || !anyOn}
        className={`
          w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide
          transition-all duration-150 flex items-center justify-center gap-2
          ${anyOn
            ? 'bg-red-600 hover:bg-red-700 active:scale-95 shadow-md shadow-red-200'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }
          disabled:opacity-60
        `}
      >
        {loading === 'stop' ? (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            <span>⛔</span>
            <span>Emergency Stop</span>
          </>
        )}
      </button>

      <p className="text-xs text-gray-400 mt-2 text-center">
        Rotation FWD/REV are mutually exclusive — switching one will turn off the other
      </p>
    </div>
  )
}
