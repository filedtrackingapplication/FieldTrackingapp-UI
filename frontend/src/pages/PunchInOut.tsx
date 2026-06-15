import { useEffect, useState } from 'react'
import { trackingApi } from '../services/api'
import { Clock, MapPin, CheckCircle, LogIn, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import networkManager from '../services/networkManager'

interface PunchState {
  is_punched_in: boolean
  punch_in_time: string | null
}

export default function PunchInOut() {
  const { user } = useAuthStore()
  const [state, setState] = useState<PunchState>({ is_punched_in: false, punch_in_time: null })
  const [attendance, setAttendance] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)

  useEffect(() => {
    if (!user) return
    // Load today's punch status and attendance history
    Promise.all([
      trackingApi.attendance(user.id, { month: new Date().getMonth() + 1, year: new Date().getFullYear() }),
    ]).then(([attRes]) => {
      const records: any[] = attRes.data
      setAttendance(records)
      const today = new Date().toISOString().split('T')[0]
      const todayRecord = records.find((r: any) => r.work_date === today)
      if (todayRecord) {
        setState({
          is_punched_in: todayRecord.punch_in_time && !todayRecord.punch_out_time,
          punch_in_time: todayRecord.punch_in_time,
        })
      }
    })
  }, [user])

  const getLocation = (): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) reject(new Error('Geolocation not supported'))
      else navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
    })

  const handlePunchIn = async () => {
    setGettingLocation(true)
    try {
      const pos = await getLocation()
      const { latitude, longitude } = pos.coords
      setGettingLocation(false)
      setLoading(true)
      try {
        await trackingApi.punchIn({ latitude, longitude, address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` })
        setState({ is_punched_in: true, punch_in_time: new Date().toISOString() })
        toast.success('Punched in successfully!')
      } catch (apiErr: any) {
        const isNetworkErr = !apiErr?.response
        if (isNetworkErr) {
          await networkManager.bufferPunch({ type: 'punch_in', latitude, longitude, address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, timestamp: new Date().toISOString() })
          setState({ is_punched_in: true, punch_in_time: new Date().toISOString() })
          toast('Saved offline — will sync when connected', { icon: '📡' })
        } else {
          toast.error(apiErr?.response?.data?.detail || apiErr.message || 'Failed to punch in')
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to get location')
    } finally {
      setGettingLocation(false)
      setLoading(false)
    }
  }

  const handlePunchOut = async () => {
    setGettingLocation(true)
    try {
      const pos = await getLocation()
      const { latitude, longitude } = pos.coords
      setGettingLocation(false)
      setLoading(true)
      try {
        const res = await trackingApi.punchOut({ latitude, longitude })
        setState({ is_punched_in: false, punch_in_time: null })
        toast.success(`Punched out! Total: ${res.data.total_hours} hrs`)
        // Reload attendance
        if (user) {
          const attRes = await trackingApi.attendance(user.id, { month: new Date().getMonth() + 1, year: new Date().getFullYear() })
          setAttendance(attRes.data)
        }
      } catch (apiErr: any) {
        const isNetworkErr = !apiErr?.response
        if (isNetworkErr) {
          await networkManager.bufferPunch({ type: 'punch_out', latitude, longitude, timestamp: new Date().toISOString() })
          setState({ is_punched_in: false, punch_in_time: null })
          toast('Saved offline — will sync when connected', { icon: '📡' })
        } else {
          toast.error(apiErr?.response?.data?.detail || apiErr.message || 'Failed to punch out')
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to get location')
    } finally {
      setGettingLocation(false)
      setLoading(false)
    }
  }

  const workingTime = state.punch_in_time
    ? (() => {
        const diff = Date.now() - new Date(state.punch_in_time).getTime()
        const h = Math.floor(diff / 3600000)
        const m = Math.floor((diff % 3600000) / 60000)
        return `${h}h ${m}m`
      })()
    : null

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Punch In / Out</h1>
        <p className="text-gray-500 text-sm">Track your daily attendance</p>
      </div>

      {/* Punch card */}
      <div className="card text-center py-10 space-y-6">
        <div className={`w-28 h-28 rounded-full mx-auto flex items-center justify-center text-white shadow-xl transition-all ${
          state.is_punched_in ? 'bg-green-500' : 'bg-gray-300'
        }`}>
          <Clock className="w-14 h-14" />
        </div>

        <div>
          <p className="text-lg font-semibold text-gray-800">
            {state.is_punched_in ? 'Currently Working' : 'Not Punched In'}
          </p>
          {state.punch_in_time && (
            <p className="text-sm text-gray-500 mt-1">
              Since {new Date(state.punch_in_time).toLocaleTimeString()}
            </p>
          )}
          {workingTime && (
            <p className="text-3xl font-bold text-green-600 mt-2">{workingTime}</p>
          )}
        </div>

        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <MapPin className="w-4 h-4" />
            Location required
          </div>
        </div>

        {!state.is_punched_in ? (
          <button
            onClick={handlePunchIn}
            disabled={loading || gettingLocation}
            className="btn-primary px-10 py-4 text-base flex items-center gap-3 mx-auto disabled:opacity-60"
          >
            <LogIn className="w-5 h-5" />
            {gettingLocation ? 'Getting Location...' : loading ? 'Punching In...' : 'Punch In'}
          </button>
        ) : (
          <button
            onClick={handlePunchOut}
            disabled={loading || gettingLocation}
            className="btn-danger px-10 py-4 text-base flex items-center gap-3 mx-auto disabled:opacity-60"
          >
            <LogOut className="w-5 h-5" />
            {gettingLocation ? 'Getting Location...' : loading ? 'Punching Out...' : 'Punch Out'}
          </button>
        )}
      </div>

      {/* Attendance history */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">This Month's Attendance</h2>
        <div className="space-y-2">
          {attendance.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No attendance records</p>
          ) : (
            attendance.slice(0, 15).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <CheckCircle className={`w-4 h-4 ${r.punch_out_time ? 'text-green-500' : 'text-yellow-500'}`} />
                  <div>
                    <p className="text-sm font-medium">{r.work_date}</p>
                    <p className="text-xs text-gray-500">
                      {r.punch_in_time ? new Date(r.punch_in_time).toLocaleTimeString() : '—'} →{' '}
                      {r.punch_out_time ? new Date(r.punch_out_time).toLocaleTimeString() : 'Open'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{r.total_hours ? `${r.total_hours} hrs` : '—'}</p>
                  {r.distance_covered && (
                    <p className="text-xs text-gray-500">{r.distance_covered} km</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
