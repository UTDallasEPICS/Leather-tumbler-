'use client'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

type Reading = { id: number; celsius: number; timestamp: string }

export default function TempChart({ data }: { data: Reading[] }) {
  const chartData = [...data].reverse().map((r) => ({
    time: new Date(r.timestamp).toLocaleTimeString(),
    temp: parseFloat(r.celsius.toFixed(2)),
  }))

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <h2 className="text-lg font-semibold mb-3">Temperature Over Time</h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} unit="°C" />
          <Tooltip formatter={(val: number) => [`${val}°C`, 'Temp']} />
          <ReferenceLine y={30} stroke="orange" strokeDasharray="4 4" label="Warn" />
          <ReferenceLine y={40} stroke="red" strokeDasharray="4 4" label="Crit" />
          <Line
            type="monotone"
            dataKey="temp"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
