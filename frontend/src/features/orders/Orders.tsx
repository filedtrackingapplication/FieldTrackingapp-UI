import { useEffect, useState, useRef } from 'react'
import { ordersApi } from '../../services/api'
import CreateOrderModal from './components/CreateOrder'
import type { Order, OrderStatus } from '../../types'
import DataTable from '../../components/DataTable'
import { ShoppingCart, TrendingUp, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import ImportTemplateButtons from '../../components/ImportTemplateButtons'

const statusBadge: Record<OrderStatus, string> = {
  pending: 'badge-yellow',
  confirmed: 'badge-blue',
  dispatched: 'badge-blue',
  delivered: 'badge-green',
  cancelled: 'badge-red',
  returned: 'badge-gray',
}

export default function Orders() {
  const [showCreate, setShowCreate] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [importResult, setImportResult] = useState<any | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([
      ordersApi.list({ status: statusFilter || undefined }),
      ordersApi.analytics(),
    ])
      .then(([ordersRes, analyticsRes]) => {
        setOrders(ordersRes.data)
        setAnalytics(analyticsRes.data)
      })
      .catch(() => toast.error('Failed to load orders'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [statusFilter])

  const columns = [
    { header: 'Order #', accessor: 'order_number' as keyof Order },
    {
      header: 'Customer',
      render: (row: Order) => row.customer?.name ?? `#${row.customer_id}`,
    },
    {
      header: 'Date',
      render: (row: Order) => new Date(row.order_date).toLocaleDateString(),
    },
    {
      header: 'Items',
      render: (row: Order) => row.items?.length ?? 0,
    },
    {
      header: 'Amount',
      render: (row: Order) => `₹${row.total_amount.toLocaleString()}`,
    },
    { header: 'Payment', accessor: 'payment_mode' as keyof Order },
    {
      header: 'Pay Status',
      render: (row: Order) => (
        <span className={row.payment_status === 'paid' ? 'badge-green' : 'badge-yellow'}>
          {row.payment_status}
        </span>
      ),
    },
    {
      header: 'Status',
      render: (row: Order) => (
        <span className={statusBadge[row.status]}>{row.status}</span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-500 text-sm">{orders.length} orders</p>
        </div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => setShowCreate(true)}
        >
          <ShoppingCart className="w-4 h-4" /> New Order
        </button>
      </div>

      {/* Analytics strip */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Package className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-gray-500">Total Orders</p>
              <p className="text-xl font-bold">{analytics.total_orders}</p>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg text-green-600"><TrendingUp className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-gray-500">Total Revenue</p>
              <p className="text-xl font-bold">₹{analytics.total_revenue?.toLocaleString()}</p>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><ShoppingCart className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-gray-500">Avg. Order Value</p>
              <p className="text-xl font-bold">₹{analytics.avg_order_value?.toFixed(0)}</p>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg text-green-600"><Package className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-gray-500">Delivered</p>
              <p className="text-xl font-bold">{analytics.by_status?.delivered ?? 0}</p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <ImportTemplateButtons
            accept=".csv"
            onFile={(f) => setCsvFile(f)}
            onUpload={async () => {
              if (!csvFile) { toast.error('Select CSV'); return }
              setUploadProgress(0); setImportResult(null)
              try {
                await new Promise<void>((resolve, reject) => {
                  const xhr = new XMLHttpRequest()
                  xhr.open('POST', '/api/orders/import')
                  const token = localStorage.getItem('access_token')
                  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
                  xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
                  }
                  xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                      setImportResult(JSON.parse(xhr.responseText))
                      toast.success('Import done')
                      setCsvFile(null)
                      resolve()
                    } else reject()
                  }
                  xhr.onerror = () => reject()
                  const fd = new FormData()
                  fd.append('file', csvFile || '')
                  xhr.send(fd)
                })
              } catch {
                toast.error('Import failed')
              } finally {
                setUploadProgress(null)
              }
            }}
            templateFilename="orders_template.csv"
            templateContent="order_number,agent_id,customer_id\nORD-ABC123,1,41\n"
          />
        </div>
        {uploadProgress !== null && <div className="mb-2">Uploading: {uploadProgress}%</div>}
        {importResult && (
          <div className="mb-4 p-2 border rounded text-sm">
            Imported: {importResult.imported}
            <div className="max-h-36 overflow-auto">
              <table className="w-full text-xs">
                <tbody>
                  {importResult.results.map((r: any) => (
                    <tr key={r.row}>
                      <td className="pr-2">{r.row}</td>
                      <td className="pr-2">{r.status}</td>
                      <td>{r.reason || r.id || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Filter */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {(['', 'pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-primary-500'
              }`}
            >
              {s === '' ? 'All' : s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <DataTable columns={columns} data={orders} emptyMessage="No orders found" />
        )}
      </div>
      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}
