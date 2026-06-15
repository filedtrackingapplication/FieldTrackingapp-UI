import { useEffect, useState } from 'react'
import { customersApi } from '../services/api'
import type { Customer } from '../types'
import DataTable from '../components/DataTable'
import { UserCheck, Search, Plus, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    customersApi.list({ search: search || undefined })
      .then((res) => setCustomers(res.data))
      .catch(() => toast.error('Failed to load customers'))
      .finally(() => setLoading(false))
  }, [search])

  const columns = [
    { header: 'Name', accessor: 'name' as keyof Customer },
    { header: 'Phone', accessor: 'phone' as keyof Customer },
    { header: 'City', accessor: 'city' as keyof Customer },
    {
      header: 'Type',
      render: (row: Customer) => (
        <span className={
          row.customer_type === 'wholesale' ? 'badge-blue' :
          row.customer_type === 'distributor' ? 'badge-red' : 'badge-green'
        }>
          {row.customer_type}
        </span>
      ),
    },
    {
      header: 'Credit Limit',
      render: (row: Customer) => `₹${row.credit_limit.toLocaleString()}`,
    },
    {
      header: 'Outstanding',
      render: (row: Customer) => (
        <span className={row.outstanding_amount > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}>
          ₹{row.outstanding_amount.toLocaleString()}
        </span>
      ),
    },
    {
      header: 'Location',
      render: (row: Customer) =>
        row.latitude && row.longitude ? (
          <a
            href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 flex items-center gap-1 text-xs"
          >
            <MapPin className="w-3 h-3" /> View
          </a>
        ) : <span className="text-gray-400">—</span>,
    },
    {
      header: 'Status',
      render: (row: Customer) => (
        <span className={row.is_active ? 'badge-green' : 'badge-gray'}>
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 text-sm">{customers.length} customers</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search by name or phone..."
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
          <DataTable columns={columns} data={customers} emptyMessage="No customers found" />
        )}
      </div>
    </div>
  )
}
