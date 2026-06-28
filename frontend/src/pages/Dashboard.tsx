import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, MapPin, ShoppingCart, DollarSign,
  ClipboardList, UserCheck, TrendingUp, Package
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import StatCard from '../components/StatCard'
import { dashboardApi } from '../services/api'
import type { DashboardStats } from '../types'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboardApi.stats()
      .then((res) => setStats(res.data))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm">Real-time overview of field operations</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Agents"
          value={stats.total_agents}
          icon={<Users className="w-6 h-6" />}
          color="blue"
          subtitle={`${stats.online_agents} online now`}
        />
        <StatCard
          title="Visits Today"
          value={stats.visits_today}
          icon={<ClipboardList className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Orders Today"
          value={stats.orders_today}
          icon={<ShoppingCart className="w-6 h-6" />}
          color="purple"
        />
        <StatCard
          title="Revenue Today"
          value={`₹${stats.revenue_today.toLocaleString()}`}
          icon={<TrendingUp className="w-6 h-6" />}
          color="yellow"
        />
        <StatCard
          title="Pending Expenses"
          value={stats.pending_expenses}
          icon={<DollarSign className="w-6 h-6" />}
          color="red"
          subtitle="Awaiting approval"
        />
        <StatCard
          title="Total Customers"
          value={stats.total_customers}
          icon={<UserCheck className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Online Agents"
          value={stats.online_agents}
          icon={<MapPin className="w-6 h-6" />}
          color="green"
          subtitle="Currently active"
        />
        <StatCard
          title="This Week Orders"
          value={stats.daily_trend.reduce((s, d) => s + d.orders, 0)}
          icon={<Package className="w-6 h-6" />}
          color="purple"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders trend */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Orders — Last 7 Days</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={stats.daily_trend}>
              <defs>
                <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="orders" stroke="#3b82f6" fill="url(#ordersGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue trend */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Revenue — Last 7 Days (₹)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.daily_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
              <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top agents */}
      {stats.top_agents.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Top Performing Agents (This Month)</h2>
          <div className="space-y-3">
            {stats.top_agents.map((agent, i) => (
              <div key={agent.id} className="flex items-center gap-4">
                <span className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-sm">{agent.name}</p>
                  <p className="text-xs text-gray-500">{agent.orders} orders</p>
                </div>
                <span className="font-semibold text-sm text-green-700">₹{agent.revenue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
