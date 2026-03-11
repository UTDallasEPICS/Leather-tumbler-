'use client'
import { useState } from 'react'

type Log = { id: number; level: string; message: string; timestamp: string }

const levelStyles: Record<string, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  critical: 'bg-red-50 border-red-300 text-red-800',
}

const levelIcons: Record<string, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
}

export default function LogPanel({ logs }: { logs: Log[] }) {
  const [filter, setFilter] = useState<string>('all')

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter)

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Event Log</h2>
        <div className="flex gap-2">
          {['all', 'info', 'warning', 'critical'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1 rounded-full border capitalize transition
                ${filter === f
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No logs found.</p>
        )}
        {filtered.map((log) => (
          <div
            key={log.id}
            className={`text-sm border rounded-lg px-3 py-2 flex gap-3 items-start ${levelStyles[log.level]}`}
          >
            <span>{levelIcons[log.level]}</span>
            <div className="flex-1">
              <p>{log.message}</p>
              <p className="text-xs opacity-60 mt-0.5">
                {new Date(log.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
