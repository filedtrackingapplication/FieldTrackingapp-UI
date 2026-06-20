import { useEffect, useState, useRef } from 'react'
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
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [importResult, setImportResult] = useState<any | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

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
        <div className="flex items-center gap-2">
          <button className="btn-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Add Agent
          </button>
          <label className="btn-outline cursor-pointer">
            Import CSV
            <input ref={el => inputRef.current = el} type="file" accept=".csv" className="hidden" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} />
          </label>
          <button className="btn" onClick={async ()=>{
            if (!csvFile) return toast.error('Select CSV first')
            setUploadProgress(0); setImportResult(null)
            try{
              await new Promise<void>((resolve,reject)=>{
                const xhr = new XMLHttpRequest(); xhr.open('POST','/api/agents/import'); const token = localStorage.getItem('access_token'); if(token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
                xhr.upload.onprogress = (e)=>{ if(e.lengthComputable) setUploadProgress(Math.round((e.loaded/e.total)*100)) }
                xhr.onload = ()=>{ if(xhr.status>=200&&xhr.status<300){ setImportResult(JSON.parse(xhr.responseText)); toast.success('Import completed'); setCsvFile(null); resolve() } else { reject() }}
                xhr.onerror = ()=>reject()
                const fd = new FormData(); fd.append('file', csvFile); xhr.send(fd)
              })
            }catch(e){ toast.error('Import failed') }
            finally{ setUploadProgress(null) }
          }}>Upload</button>
          <button className="btn ghost" onClick={()=>{
            const csv = 'full_name,email,phone,employee_id,role\nAgent One,agent1@example.com,9991112222,AG001,field_agent\n'
            const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'agents_template.csv'; a.click(); URL.revokeObjectURL(url)
          }}>Download Template</button>
        </div>
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
        {uploadProgress !== null && <div className="mt-2">Uploading: {uploadProgress}%</div>}
        {importResult && (
          <div className="mt-3 p-2 border rounded text-sm">
            <div>Imported: {importResult.imported}</div>
            <div className="max-h-36 overflow-auto">
              <table className="w-full text-left text-xs"><tbody>{importResult.results.map((r:any)=>(<tr key={r.row}><td className="pr-2">{r.row}</td><td className="pr-2">{r.status}</td><td>{r.reason||r.id||''}</td></tr>))}</tbody></table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
