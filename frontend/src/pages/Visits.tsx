import { useEffect, useState } from 'react'
import { visitsApi } from '../services/api'
import type { Visit, VisitStatus } from '../types'
import DataTable from '../components/DataTable'
import { ClipboardList, CheckCircle, Clock, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import ImportTemplateButtons from '../components/ImportTemplateButtons'
import { useRef } from 'react'

const statusBadge: Record<VisitStatus, string> = {
  planned: 'badge-blue',
  in_progress: 'badge-yellow',
  completed: 'badge-green',
  missed: 'badge-red',
}

export default function Visits() {
  const [visits, setVisits] = useState<Visit[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [csv, setCsv] = useState<File|null>(null)
  const [uploading, setUploading] = useState<number|null>(null)

  useEffect(() => {
    Promise.all([visitsApi.list(), visitsApi.summaryToday()])
      .then(([visitsRes, summaryRes]) => {
        setVisits(visitsRes.data)
        setSummary(summaryRes.data)
      })
      .catch(() => toast.error('Failed to load visits'))
      .finally(() => setLoading(false))
  }, [])

  const columns = [
    { header: 'Date', accessor: 'visit_date' as keyof Visit },
    {
      header: 'Customer',
      render: (row: Visit) => row.customer?.name ?? `#${row.customer_id}`,
    },
    { header: 'Purpose', accessor: 'purpose' as keyof Visit },
    {
      header: 'Status',
      render: (row: Visit) => <span className={statusBadge[row.status]}>{row.status.replace('_', ' ')}</span>,
    },
    {
      header: 'Check In',
      render: (row: Visit) =>
        row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString() : <span className="text-gray-400">—</span>,
    },
    {
      header: 'Check Out',
      render: (row: Visit) =>
        row.check_out_time ? new Date(row.check_out_time).toLocaleTimeString() : <span className="text-gray-400">—</span>,
    },
    {
      header: 'Duration',
      render: (row: Visit) =>
        row.duration_minutes ? `${row.duration_minutes} min` : <span className="text-gray-400">—</span>,
    },
    { header: 'Outcome', accessor: 'outcome' as keyof Visit },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visits</h1>
          <p className="text-gray-500 text-sm">Customer visit tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> New Visit
          </button>
          <ImportTemplateButtons accept=".csv" onFile={(f)=>setCsv(f)} onUpload={async ()=>{
            if(!csv) return toast.error('Select CSV first')
            setUploading(0)
            try{
              await new Promise<void>((resolve,reject)=>{
                const xhr = new XMLHttpRequest(); xhr.open('POST','/api/visits/import'); const token = localStorage.getItem('access_token'); if(token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
                xhr.upload.onprogress = (e)=>{ if(e.lengthComputable) setUploading(Math.round((e.loaded/e.total)*100)) }
                xhr.onload = ()=>{ if(xhr.status>=200&&xhr.status<300){ toast.success('Import completed'); setCsv(null); resolve() } else { reject() }}
                xhr.onerror = ()=>reject()
                const fd = new FormData(); fd.append('file', csv || ''); xhr.send(fd)
              })
            }catch(e){ toast.error('Import failed') }
            finally{ setUploading(null) }
          }} templateFilename={'visits_template.csv'} templateContent={'customer_id,agent_id,visit_date,purpose\n'} />
        </div>
      </div>

      {/* Today's summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Today', value: summary.total, icon: <ClipboardList className="w-5 h-5" />, color: 'text-blue-600 bg-blue-50' },
            { label: 'Completed', value: summary.completed, icon: <CheckCircle className="w-5 h-5" />, color: 'text-green-600 bg-green-50' },
            { label: 'In Progress', value: summary.in_progress, icon: <Clock className="w-5 h-5" />, color: 'text-yellow-600 bg-yellow-50' },
            { label: 'Missed', value: summary.total - summary.completed - summary.in_progress - summary.planned, icon: <XCircle className="w-5 h-5" />, color: 'text-red-600 bg-red-50' },
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
          <DataTable columns={columns} data={visits} emptyMessage="No visits found" />
        )}
      </div>
    </div>
  )
}
