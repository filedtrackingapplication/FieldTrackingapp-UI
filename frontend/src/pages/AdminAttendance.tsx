import { useEffect, useState } from 'react'
import { adminAttendanceApi } from '../services/api'
import toast from 'react-hot-toast'
import type { PunchRecord } from '../types'

export default function AdminAttendance() {
  const [rows, setRows] = useState<PunchRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [agentId, setAgentId] = useState<string>('')

  function fetchList() {
    setLoading(true)
    const params: any = {}
    if (start) params.start = start
    if (end) params.end = end
    if (agentId) params.agent_id = Number(agentId)
    adminAttendanceApi.list(params)
      .then((res) => setRows(res.data))
      .catch(() => toast.error('Failed to load attendance'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchList() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Attendance (Admin)</h1>
          <p className="text-sm text-gray-500">View and export team attendance</p>
        </div>
        <div className="flex gap-2">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input" />
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
          <input type="text" placeholder="Agent ID" value={agentId} onChange={(e) => setAgentId(e.target.value)} className="input w-28" />
          <button onClick={fetchList} className="btn">Filter</button>
          <button onClick={() => {
            const params: any = {}
            if (start) params.start = start
            if (end) params.end = end
            if (agentId) params.agent_id = Number(agentId)
            // trigger download
            const query = new URLSearchParams(params).toString()
            window.open(`/api/admin/attendance/export?${query}`, '_blank')
          }} className="btn-outline">Export CSV</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="py-8 text-center">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">In</th>
                  <th className="px-3 py-2">Out</th>
                  <th className="px-3 py-2">Hours</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.id}</td>
                    <td className="px-3 py-2">{r.agent_id}</td>
                    <td className="px-3 py-2">{r.work_date}</td>
                    <td className="px-3 py-2">{r.punch_in_time ?? '-'}</td>
                    <td className="px-3 py-2">{r.punch_out_time ?? '-'}</td>
                    <td className="px-3 py-2">{r.duration ?? (r.total_hours != null ? `${r.total_hours} hrs` : '-')}</td>
                    <td className="px-3 py-2">{r.notes ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
