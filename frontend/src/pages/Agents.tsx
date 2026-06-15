import { useEffect, useState } from 'react'
import { agentsApi } from '../services/api'
import type { User } from '../types'
import DataTable from '../components/DataTable'
import { UserPlus, Search, Wifi, WifiOff } from 'lucide-react'
import toast from 'react-hot-toast'

const roleColors: Record<string, string> = {
  admin: 'badge-red',
  manager: 'badge-blue',
  field_agent: 'badge-green',
  driver: 'badge-yellow',
}

export default function Agents() {
  const [agents, setAgents] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    agentsApi.list({ search: search || undefined })
      .then((res) => setAgents(res.data))
      .catch(() => toast.error('Failed to load agents'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [search])

  const columns = [
    { header: 'Employee ID', accessor: 'employee_id' as keyof User },
    { header: 'Name', accessor: 'full_name' as keyof User },
    { header: 'Phone', accessor: 'phone' as keyof User },
    {
      header: 'Role',
      render: (row: User) => (
        <span className={roleColors[row.role] ?? 'badge-gray'}>{row.role.replace('_', ' ')}</span>
      ),
    },
    { header: 'Zone', accessor: 'assigned_zone' as keyof User },
    { header: 'Vehicle', accessor: 'vehicle_number' as keyof User },
    {
      header: 'Status',
      render: (row: User) => (
        <div className="flex items-center gap-1.5">
          {row.online_status === 'online' ? (
            <><Wifi className="w-3.5 h-3.5 text-green-500" /><span className="badge-green">Online</span></>
          ) : (
            <><WifiOff className="w-3.5 h-3.5 text-gray-400" /><span className="badge-gray">Offline</span></>
          )}
        </div>
      ),
    },
    {
      header: 'Last Seen',
      render: (row: User) => row.last_seen
        ? new Date(row.last_seen).toLocaleString()
        : <span className="text-gray-400">—</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="text-gray-500 text-sm">{agents.length} total agents</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Add Agent
        </button>
      </div>

      <div className="card">
        {/* Search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search by name, ID or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <DataTable columns={columns} data={agents} emptyMessage="No agents found" />
        )}
      </div>
    </div>
  )
}
