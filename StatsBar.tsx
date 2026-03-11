type Stats = {
  min_temp: number
  max_temp: number
  avg_temp: number
  total_readings: number
}

export default function StatsBar({ stats }: { stats: Stats }) {
  const items = [
    { label: 'Min', value: `${stats.min_temp?.toFixed(2)}°C`, color: 'text-blue-500' },
    { label: 'Max', value: `${stats.max_temp?.toFixed(2)}°C`, color: 'text-red-500' },
    { label: 'Avg', value: `${stats.avg_temp?.toFixed(2)}°C`, color: 'text-green-500' },
    { label: 'Readings', value: stats.total_readings, color: 'text-gray-700' },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {items.map((item) => (
        <div key={item.label} className="bg-white rounded-2xl shadow p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">{item.label}</p>
          <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.value}</p>
        </div>
      ))}
    </div>
  )
}
