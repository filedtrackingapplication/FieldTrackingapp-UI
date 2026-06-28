import { useEffect, useState } from 'react'
import { customersApi } from '../services/api'
import type { Customer } from '../types'
import DataTable from '../components/DataTable'
import { UserCheck, Search, Plus, MapPin } from 'lucide-react'
import ImportTemplateButtons from '../components/ImportTemplateButtons'
import toast from 'react-hot-toast'


export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', city: '', address: '', customer_type: '' })
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<any | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

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
        <div className="flex items-center gap-2">
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(s => !s)}>
            <Plus className="w-4 h-4" /> Add Customer
          </button>
          <ImportTemplateButtons
            accept=".csv"
            onFile={(f)=>setCsvFile(f)}
            onUpload={async ()=>{
              setImportError(null)
              setImportResult(null)
              setUploadProgress(0)
              if (!csvFile) { toast.error('Select a CSV file first'); return }
              try {
                await new Promise<void>((resolve, reject) => {
                  const xhr = new XMLHttpRequest()
                  xhr.open('POST', '/api/customers/import')
                  const token = localStorage.getItem('access_token')
                  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
                  xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
                  }
                  xhr.onload = () => {
                    const status = xhr.status
                    let json: any = null
                    try { json = JSON.parse(xhr.responseText) } catch (e) { json = null }
                    if (status >= 200 && status < 300) {
                      setImportResult(json)
                      toast.success(`Imported ${json.imported} customers`)
                      setCsvFile(null)
                      resolve()
                    } else if (json && json.detail) {
                      setImportError(JSON.stringify(json.detail))
                      reject(new Error('Import failed'))
                    } else {
                      setImportError(`HTTP ${status}`)
                      reject(new Error('Import failed'))
                    }
                  }
                  xhr.onerror = () => { setImportError('Network error'); reject(new Error('Network error')) }
                  const fd = new FormData(); fd.append('file', csvFile || '')
                  xhr.send(fd)
                })
              } catch (err) {
                toast.error('Import failed')
              } finally {
                setUploadProgress(null)
              }
            }}
            templateFilename={'customers_template.csv'}
            templateContent={'name,phone,email,address,city,customer_type,assigned_agent_email\nShop A,8887776666,shopa@example.com,123 Main St,Pune,retail,agent@example.com\n'}
          />
        </div>
      </div>

      <div className="card">
          {showForm && (
            <div className="mb-4 p-4 border rounded">
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Name" value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} />
                <input className="input" placeholder="Phone" value={form.phone} onChange={(e)=>setForm({...form, phone:e.target.value})} />
                <input className="input" placeholder="City" value={form.city} onChange={(e)=>setForm({...form, city:e.target.value})} />
                <input className="input" placeholder="Type" value={form.customer_type} onChange={(e)=>setForm({...form, customer_type:e.target.value})} />
                <input className="input col-span-2" placeholder="Address" value={form.address} onChange={(e)=>setForm({...form, address:e.target.value})} />
              </div>
              <div className="mt-3 flex gap-2">
                <button className="btn-primary" onClick={async ()=>{
                  try {
                    const res = await customersApi.onboard(form)
                    toast.success('Customer onboarded')
                    setCustomers(s => [res.data, ...s])
                    setShowForm(false)
                    setForm({ name: '', phone: '', city: '', address: '', customer_type: '' })
                  } catch (err) {
                    toast.error('Onboard failed')
                  }
                }}>Save</button>
                <button className="btn" onClick={()=>setShowForm(false)}>Cancel</button>
              </div>
            </div>
          )}

          {importResult && (
            <div className="mt-4 p-3 border rounded">
              <h3 className="font-semibold">Import Results</h3>
              <p>Imported: {importResult.imported}</p>
              <div className="max-h-48 overflow-auto text-sm mt-2">
                <table className="w-full text-left">
                  <thead>
                    <tr><th className="pr-2">Row</th><th className="pr-2">Status</th><th>Info</th></tr>
                  </thead>
                  <tbody>
                    {importResult.results.map((r: any) => (
                      <tr key={r.row} className="border-t"><td className="pr-2">{r.row}</td><td className="pr-2">{r.status}</td><td>{r.reason || r.id || ''}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {uploadProgress !== null && (
            <div className="mt-2">Uploading: {uploadProgress}%</div>
          )}
          {importError && (
            <div className="mt-2 text-sm text-red-600">Error: {importError}</div>
          )}
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
