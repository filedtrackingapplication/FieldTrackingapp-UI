import { useEffect, useState, useRef } from 'react'
import { expensesApi } from '../services/api'
import type { Expense, ExpenseStatus } from '../types'
import DataTable from '../components/DataTable'
import { DollarSign, CheckCircle, Clock, XCircle, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import ImportTemplateButtons from '../components/ImportTemplateButtons'
import { useAuthStore } from '../store/authStore'


const statusBadge: Record<ExpenseStatus, string> = {
  pending: 'badge-yellow',
  approved: 'badge-green',
  rejected: 'badge-red',
}

const categoryLabel: Record<string, string> = {
  fuel: '⛽ Fuel', food: '🍽️ Food', accommodation: '🏨 Accommodation',
  toll: '🛣️ Toll', parking: '🅿️ Parking', maintenance: '🔧 Maintenance', misc: '📦 Misc',
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [summary, setSummary] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { user } = useAuthStore()
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [importResult, setImportResult] = useState<any | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([expensesApi.list(), expensesApi.summary()])
      .then(([expRes, sumRes]) => {
        setExpenses(expRes.data)
        setSummary(sumRes.data)
      })
      .catch(() => toast.error('Failed to load expenses'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleApprove = async (id: number, status: 'approved' | 'rejected') => {
    try {
      await expensesApi.review(id, { status })
      toast.success(`Expense ${status}`)
      load()
    } catch {
      toast.error('Failed to update expense')
    }
  }

  const columns = [
    {
      header: 'Category',
      render: (row: Expense) => categoryLabel[row.category] ?? row.category,
    },
    {
      header: 'Amount',
      render: (row: Expense) => <span className="font-semibold">₹{row.amount.toLocaleString()}</span>,
    },
    { header: 'Date', accessor: 'expense_date' as keyof Expense },
    { header: 'Description', accessor: 'description' as keyof Expense },
    {
      header: 'Receipt',
      render: (row: Expense) =>
        row.receipt_photo ? (
          <a href={row.receipt_photo} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs underline">View</a>
        ) : <span className="text-gray-400">—</span>,
    },
    {
      header: 'Status',
      render: (row: Expense) => <span className={statusBadge[row.status]}>{row.status}</span>,
    },
    ...(user?.role === 'admin' || user?.role === 'manager' ? [{
      header: 'Actions',
      render: (row: Expense) =>
        row.status === 'pending' ? (
          <div className="flex gap-2">
            <button onClick={() => handleApprove(row.id, 'approved')} className="text-green-600 hover:text-green-700">
              <CheckCircle className="w-4 h-4" />
            </button>
            <button onClick={() => handleApprove(row.id, 'rejected')} className="text-red-500 hover:text-red-600">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        ) : <span className="text-gray-400 text-xs">—</span>,
    }] : []),
  ]

  const totalPending = expenses.filter((e) => e.status === 'pending').reduce((s, e) => s + e.amount, 0)
  const totalApproved = expenses.filter((e) => e.status === 'approved').reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-gray-500 text-sm">{expenses.length} records</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Upload className="w-4 h-4" /> Submit Expense
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card flex items-center gap-3">
          <div className="p-2 bg-yellow-50 rounded-lg text-yellow-600"><Clock className="w-5 h-5" /></div>
          <div>
            <p className="text-xs text-gray-500">Pending</p>
            <p className="text-xl font-bold">₹{totalPending.toLocaleString()}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg text-green-600"><CheckCircle className="w-5 h-5" /></div>
          <div>
            <p className="text-xs text-gray-500">Approved</p>
            <p className="text-xl font-bold">₹{totalApproved.toLocaleString()}</p>
          </div>
        </div>
        {summary.slice(0, 2).map((s) => (
          <div key={s.category} className="card flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><DollarSign className="w-5 h-5" /></div>
            <div>
              <p className="text-xs text-gray-500">{categoryLabel[s.category] ?? s.category}</p>
              <p className="text-xl font-bold">₹{s.total?.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <ImportTemplateButtons
            accept=".csv"
            onFile={(f)=>setCsvFile(f)}
            onUpload={async ()=>{
              if(!csvFile) return toast.error('Select CSV')
              setUploadProgress(0); setImportResult(null)
              try{ await new Promise<void>((resolve,reject)=>{ const xhr=new XMLHttpRequest(); xhr.open('POST','/api/expenses/import'); const token=localStorage.getItem('access_token'); if(token) xhr.setRequestHeader('Authorization', `Bearer ${token}`); xhr.upload.onprogress=(e)=>{ if(e.lengthComputable) setUploadProgress(Math.round((e.loaded/e.total)*100)) }; xhr.onload=()=>{ if(xhr.status>=200&&xhr.status<300){ setImportResult(JSON.parse(xhr.responseText)); toast.success('Import done'); setCsvFile(null); resolve() } else reject() }; xhr.onerror=()=>reject(); const fd=new FormData(); fd.append('file', csvFile||''); xhr.send(fd) }) }catch(e){ toast.error('Import failed') } finally{ setUploadProgress(null) }
            }}
            templateFilename={'expenses_template.csv'}
            templateContent={'agent_id,amount,expense_date,category,description,reference\n1,120.50,2026-06-19,fuel,Petrol,REF123\n'}
          />
        </div>
        {uploadProgress !== null && <div className="mb-2">Uploading: {uploadProgress}%</div>}
        {importResult && (<div className="mb-4 p-2 border rounded text-sm">Imported: {importResult.imported}<div className="max-h-36 overflow-auto"><table className="w-full text-xs"><tbody>{importResult.results.map((r:any)=>(<tr key={r.row}><td className="pr-2">{r.row}</td><td className="pr-2">{r.status}</td><td>{r.reason||r.id||''}</td></tr>))}</tbody></table></div></div>)}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <DataTable columns={columns} data={expenses} emptyMessage="No expenses found" />
        )}
      </div>
    </div>
  )
}
