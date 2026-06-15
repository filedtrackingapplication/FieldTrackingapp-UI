import { useEffect, useState } from 'react'
import { ordersApi, expensesApi, odometerApi } from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { BarChart3 } from 'lucide-react'

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

export default function Reports() {
  const [orderAnalytics, setOrderAnalytics] = useState<any>(null)
  const [expenseSummary, setExpenseSummary] = useState<any[]>([])
  const [odometerSummary, setOdometerSummary] = useState<any>(null)

  useEffect(() => {
    Promise.all([
      ordersApi.analytics(),
      expensesApi.summary(),
      odometerApi.summary({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }),
    ]).then(([ordRes, expRes, odoRes]) => {
      setOrderAnalytics(ordRes.data)
      setExpenseSummary(expRes.data)
      setOdometerSummary(odoRes.data)
    })
  }, [])

  const ordersByStatus = orderAnalytics
    ? Object.entries(orderAnalytics.by_status || {}).map(([name, value]) => ({ name, value: Number(value) }))
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
        <p className="text-gray-500 text-sm">Performance overview and insights</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Orders', value: orderAnalytics?.total_orders ?? '—', color: 'text-blue-600' },
          { label: 'Total Revenue', value: orderAnalytics ? `₹${orderAnalytics.total_revenue?.toLocaleString()}` : '—', color: 'text-green-600' },
          { label: 'Avg. Order Value', value: orderAnalytics ? `₹${orderAnalytics.avg_order_value?.toFixed(0)}` : '—', color: 'text-purple-600' },
          { label: 'Distance This Month', value: odometerSummary ? `${odometerSummary.total_km?.toFixed(0)} km` : '—', color: 'text-orange-600' },
        ].map((k) => (
          <div key={k.label} className="card text-center">
            <p className="text-xs text-gray-500 mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders by status donut */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" /> Orders by Status
          </h2>
          {ordersByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={ordersByStatus} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {ordersByStatus.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">No data</p>
          )}
        </div>

        {/* Expense by category */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-green-500" /> Expenses by Category (₹)
          </h2>
          {expenseSummary.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={expenseSummary} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">No data</p>
          )}
        </div>
      </div>

      {/* Odometer summary */}
      {odometerSummary && (
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Vehicle Summary — This Month</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total KM', value: `${odometerSummary.total_km?.toFixed(1)} km` },
              { label: 'Total Trips', value: odometerSummary.trips },
              { label: 'Fuel Consumed', value: `${odometerSummary.total_fuel_litres?.toFixed(1)} L` },
              { label: 'Fuel Spend', value: `₹${odometerSummary.total_fuel_cost?.toLocaleString()}` },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className="text-xl font-bold text-gray-800">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
