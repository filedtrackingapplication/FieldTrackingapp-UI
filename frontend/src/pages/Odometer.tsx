import { useEffect, useState } from 'react'
import { odometerApi } from '../services/api'
import type { OdometerLog } from '../types'
import DataTable from '../components/DataTable'
import { Gauge, Plus, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Odometer() {
  const [logs, setLogs] = useState<OdometerLog[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([odometerApi.list(), odometerApi.summary()])
      .then(([logsRes, sumRes]) => {
        setLogs(logsRes.data)
        setSummary(sumRes.data)
      })
      .catch(() => toast.error('Failed to load odometer logs'))
      .finally(() => setLoading(false))
  }, [])

  const columns = [
    { header: 'Date', accessor: 'log_date' as keyof OdometerLog },
    { header: 'Vehicle', accessor: 'vehicle_number' as keyof OdometerLog },
    {
      header: 'Start (km)',
      render: (row: OdometerLog) => row.start_reading.toLocaleString(),
    },
    {
      header: 'End (km)',
      render: (row: OdometerLog) =>
        row.end_reading ? row.end_reading.toLocaleString() : <span className="text-yellow-600 font-medium">Open</span>,
    },
    {
      header: 'Distance',
      render: (row: OdometerLog) =>
        row.distance_travelled ? (
          <span className="font-semibold text-blue-700">{row.distance_travelled} km</span>
        ) : <span className="text-gray-400">—</span>,
    },
    {
      header: 'Fuel (L)',
      render: (row: OdometerLog) => row.fuel_added ?? <span className="text-gray-400">—</span>,
    },
    {
      header: 'Fuel Cost',
      render: (row: OdometerLog) => row.fuel_cost ? `₹${row.fuel_cost}` : <span className="text-gray-400">—</span>,
    },
    { header: 'Notes', accessor: 'notes' as keyof OdometerLog },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Odometer Logs</h1>
          <p className="text-gray-500 text-sm">Vehicle mileage tracking</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Start Trip
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Distance', value: `${summary.total_km?.toFixed(1) ?? 0} km`, color: 'bg-blue-50 text-blue-600', icon: <Gauge className="w-5 h-5" /> },
            { label: 'Total Trips', value: summary.trips, color: 'bg-purple-50 text-purple-600', icon: <TrendingUp className="w-5 h-5" /> },
            { label: 'Total Fuel', value: `${summary.total_fuel_litres?.toFixed(1) ?? 0} L`, color: 'bg-yellow-50 text-yellow-600', icon: <Gauge className="w-5 h-5" /> },
            { label: 'Fuel Cost', value: `₹${summary.total_fuel_cost?.toLocaleString() ?? 0}`, color: 'bg-green-50 text-green-600', icon: <TrendingUp className="w-5 h-5" /> },
          ].map((s) => (
            <div key={s.label} className="card flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <DataTable columns={columns} data={logs} emptyMessage="No odometer logs" />
        )}
      </div>
    </div>
  )
}
