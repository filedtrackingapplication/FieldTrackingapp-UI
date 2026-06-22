import React, { useEffect, useState } from 'react'
import { visitsApi } from '../../services/api'
import type { Visit, VisitStatus } from '../../features/visits/types'
import DataTable from '../../components/DataTable'
import { ClipboardList, CheckCircle, Clock, XCircle } from 'lucide-react'
import VisitModal from './components/VisitModal'
import { visitMetaApi } from '../../services/api'
import toast from 'react-hot-toast'
import ImportTemplateButtons from '../../components/ImportTemplateButtons'

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
  const [openModal, setOpenModal] = useState(false)
  const [selectedId, setSelectedId] = useState<number|string|null>(null)
  const [editingVisit, setEditingVisit] = useState<Visit|null>(null)
  const [types, setTypes] = useState<any[]>([])
  const [statuses, setStatuses] = useState<any[]>([])

  useEffect(() => {
    Promise.all([visitsApi.list(), visitsApi.summaryToday()])
      .then(([visitsRes, summaryRes]) => {
        setVisits(visitsRes.data)
        setSummary(summaryRes.data)
      })
      .catch(() => toast.error('Failed to load visits'))
      .finally(() => setLoading(false))
    // load meta
    visitMetaApi.types().then(r=>setTypes(r.data)).catch(()=>setTypes([]))
    visitMetaApi.statuses().then(r=>setStatuses(r.data)).catch(()=>setStatuses([]))
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
        (row.check_in_time || (row as any).check_in || (row as any).checkin_time)
          ? new Date((row.check_in_time || (row as any).check_in || (row as any).checkin_time) as string).toLocaleTimeString()
          : <span className="text-gray-400">—</span>,
    },
    {
      header: 'Check Out',
      render: (row: Visit) =>
        (row.check_out_time || (row as any).check_out || (row as any).checkout_time)
          ? new Date((row.check_out_time || (row as any).check_out || (row as any).checkout_time) as string).toLocaleTimeString()
          : <span className="text-gray-400">—</span>,
    },
    {
      header: 'Duration',
      render: (row: Visit) =>
        (row.duration_minutes ?? (row as any).duration)
          ? `${row.duration_minutes ?? (row as any).duration} min`
          : <span className="text-gray-400">—</span>,
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
          <button className="btn-primary flex items-center gap-2" onClick={()=>{ setEditingVisit(null); setOpenModal(true) }}>
            <ClipboardList className="w-4 h-4" /> New Visit
          </button>
          <button
            className={`btn-primary flex items-center gap-2 ${selectedId ? '' : 'opacity-50 cursor-not-allowed'}`}
            onClick={() => {
              if (!selectedId) return
              const v = visits.find((x) => String(x.id) === String(selectedId)) || null
              setEditingVisit(v)
              setOpenModal(true)
            }}
            disabled={!selectedId}
          >
            Edit
          </button>
          {openModal && (
            <VisitModal
              onClose={() => setOpenModal(false)}
              initial={editingVisit || undefined}
              onSave={async (data)=>{
                try{
                  if(editingVisit && editingVisit.id){
                    await visitsApi.update(String(editingVisit.id), data)
                    toast.success('Visit updated')
                  } else {
                    // Ensure agent_id is set to the logged-in user's id
                    let agentId: number | null = null
                    try {
                      const raw = localStorage.getItem('state') || localStorage.getItem('auth') || localStorage.getItem('user')
                      if (raw) {
                        const parsed = JSON.parse(raw)
                        // support nested shapes: { state: { user: { id }}} or { user: { id }} or { id }
                        agentId = parsed?.state?.user?.id || parsed?.user?.id || parsed?.id || null
                      }
                    } catch (err) {
                      agentId = null
                    }
                    // fallback: fetch /auth/me if token present and agentId still null
                    if (!agentId) {
                      try {
                        const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${localStorage.getItem('access_token') || ''}` } })
                        if (meRes.ok) {
                          const me = await meRes.json()
                          agentId = me?.id || null
                        }
                      } catch (e) {
                        agentId = null
                      }
                    }
                    if (agentId) data.agent_id = agentId
                    await visitsApi.create(data)
                    toast.success('Visit created')
                  }

                  // refresh list and summary
                  setLoading(true)
                  const [visitsRes, summaryRes] = await Promise.all([visitsApi.list(), visitsApi.summaryToday()])
                  setVisits(visitsRes.data)
                  setSummary(summaryRes.data)
                }catch(e){
                  toast.error('Failed to save visit')
                  throw e
                }finally{ setLoading(false); setOpenModal(false); setSelectedId(null); setEditingVisit(null) }
              }}
              meta={{ types, statuses }}
            />
          )}
          <ImportTemplateButtons accept=".csv" onFile={(f)=>setCsv(f)} onUpload={async ()=>{
            if(!csv) { toast.error('Select CSV first'); return }
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
          <DataTable
            columns={columns}
            data={visits}
            emptyMessage="No visits found"
            onRowClick={(row: Visit) => setSelectedId(row.id ?? null)}
            selectedRowId={selectedId}
          />
        )}
      </div>
    </div>
  )
}
