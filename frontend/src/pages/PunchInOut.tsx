import { useEffect, useRef, useState } from 'react'
import { trackingApi, visitsApi } from '../services/api'
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [state, setState] = useState<PunchState>({ is_punched_in: false, punch_in_time: null })
  const [attendance, setAttendance] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)
  const [showPunchOutModal, setShowPunchOutModal] = useState(false)
  const [odometerOut, setOdometerOut] = useState<string>('')
  const [odometerIn, setOdometerIn] = useState<string>('')
  const [remarkOut, setRemarkOut] = useState<string>('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [remarkIn, setRemarkIn] = useState<string>('')
  const [photoInFile, setPhotoInFile] = useState<File | null>(null)
  const [photoInPreview, setPhotoInPreview] = useState<string | null>(null)
  const [locationDetails, setLocationDetails] = useState<string>('Location will be captured when you punch in')
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  useEffect(() => {
    if (!user) return
    Promise.all([
      trackingApi.attendance(user.id, { month: new Date().getMonth() + 1, year: new Date().getFullYear() }),
    ]).then(([attRes]) => {
      const records: any[] = attRes.data
      setAttendance(records)
      const today = new Date().toISOString().split('T')[0]
      const todayRecord = records.find((r: any) => r.work_date === today)

      setState({
        is_punched_in: Boolean(todayRecord?.punch_in_time && !todayRecord?.punch_out_time),
        punch_in_time: todayRecord?.punch_in_time || null,
      })
    })
  }, [user])

  useEffect(() => {
    void refreshLocation()
  }, [])

  const getLocation = (): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) reject(new Error('Geolocation not supported'))
      else navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
    })
   const getAddressFromCoordinates = async (
  latitude: number,
  longitude: number
) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
    )

    const data = await response.json()

    return (
      data.address?.suburb ||
      data.address?.neighbourhood ||
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      data.display_name
    )
  } catch {
    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
  }
}
  const refreshLocation = async () => {
    setLocationStatus('loading')
    try {
      const pos = await getLocation()
      const { latitude, longitude } = pos.coords
      const address = await getAddressFromCoordinates(
  latitude,
  longitude
)

setLocationDetails(address)
      setLocationStatus('ready')
    } catch (err: any) {
      setLocationDetails('Location unavailable')
      setLocationStatus('error')
      toast.error(err.message || 'Unable to fetch location')
    }
  }

  const resetPunchInForm = () => {
    setRemarkIn('')
    setOdometerIn('')
    setPhotoInFile(null)
    setPhotoInPreview(null)
  }

  const resetPunchOutForm = () => {
    setOdometerOut('')
    setRemarkOut('')
    setPhotoFile(null)
  }

  const handlePhotoSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setPhotoInFile(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setPhotoInPreview(url)
    } else {
      setPhotoInPreview(null)
    }
  }

  const handlePunchIn = async () => {
    if (loading || gettingLocation) return
    setGettingLocation(true)
    try {
      const pos = await getLocation()
      const { latitude, longitude } = pos.coords
      const locationText = await getAddressFromCoordinates(
  latitude,
  longitude
)
      setLocationDetails(locationText)
      setLocationStatus('ready')
      setLoading(true)
      try {
        let payload: any = {
          latitude,
          longitude,
          address: locationText,
          notes: remarkIn.trim() || undefined,
          odometer_in: odometerIn.trim() || undefined,
        }

        if (photoInFile) {
          const b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = reject
            reader.readAsDataURL(photoInFile)
          })
          payload.photo = b64
        } else if (photoInPreview) {
          payload.photo = photoInPreview
        }

        await trackingApi.punchIn(payload)
        toast.success('Punched in successfully!')
        setState({ is_punched_in: true, punch_in_time: new Date().toISOString() })
        resetPunchInForm()
      } catch (apiErr: any) {
        const isNetworkErr = !apiErr?.response
        if (isNetworkErr) {
          await networkManager.bufferPunch({
            type: 'punch_in',
            latitude,
            longitude,
            address: locationText,
            notes: remarkIn.trim() || undefined,
            odometer_in: odometerIn.trim() || undefined,
            photo: photoInFile ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(String(reader.result))
              reader.onerror = reject
              reader.readAsDataURL(photoInFile)
            }) : photoInPreview || undefined,
            timestamp: new Date().toISOString(),
          })
          setState({ is_punched_in: true, punch_in_time: new Date().toISOString() })
          resetPunchInForm()
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
    if (loading || gettingLocation) return
    setGettingLocation(true)
    try {
      const pos = await getLocation()
      const { latitude, longitude } = pos.coords
      setLoading(true)
      try {
        const activeVisit = localStorage.getItem('active_visit_id')
        if (activeVisit) {
          await visitsApi.checkOut(Number(activeVisit), { latitude, longitude })
          localStorage.removeItem('active_visit_id')
          toast.success('Checked out of visit')
          setShowPunchOutModal(false)
          resetPunchOutForm()
        } else {
          let payload: any = {
            latitude,
            longitude,
            odometer_out: odometerOut || undefined,
            remark: remarkOut || undefined,
          }
          if (photoFile) {
            const b64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(String(reader.result))
              reader.onerror = reject
              reader.readAsDataURL(photoFile)
            })
            payload.photo = b64
          }

          const res = await trackingApi.punchOut(payload)
          if (res && (res.status === 200 || res.status === 201 || res.status === 204)) {
            toast.success(`Punched out! Total: ${res.data.duration || res.data.total_hours || '—'}`)
            setState({ is_punched_in: false, punch_in_time: null })
            setShowPunchOutModal(false)
            resetPunchOutForm()
          } else {
            toast.error('Punch out failed')
          }
        }

        if (user) {
          const attRes = await trackingApi.attendance(user.id, { month: new Date().getMonth() + 1, year: new Date().getFullYear() })
          setAttendance(attRes.data)
        }
      } catch (apiErr: any) {
        const isNetworkErr = !apiErr?.response
        if (isNetworkErr) {
          await networkManager.bufferPunch({
            type: 'punch_out',
            latitude,
            longitude,
            notes: remarkOut.trim() || undefined,
            photo: photoFile ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(String(reader.result))
              reader.onerror = reject
              reader.readAsDataURL(photoFile)
            }) : undefined,
            timestamp: new Date().toISOString(),
          })
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

      <div className="card py-8">

  <div className="flex flex-col items-center">

    {/* Photo Preview / Clock */}
    {photoInPreview ? (
      <img
        src={photoInPreview}
        alt="Preview"
        className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
      />
    ) : (
      <div
        className={`w-32 h-32 rounded-full flex items-center justify-center text-white shadow-xl ${
          state.is_punched_in ? "bg-green-500" : "bg-gray-300"
        }`}
      >
        <Clock className="w-16 h-16" />
      </div>
    )}
   
    <h2 className="text-xl font-semibold mt-5">
      {state.is_punched_in
        ? "Currently Working"
        : "Not Punched In"}
    </h2>

    {state.punch_in_time && (
      <p className="text-sm text-gray-500 mt-1">
        Since {new Date(state.punch_in_time).toLocaleTimeString()}
      </p>
    )}

    {workingTime && (
      <p className="text-4xl font-bold text-green-600 mt-2">
        {workingTime}
      </p>
    )}

    {/* Location */}
     <div>
    <button type="button" onClick={refreshLocation} className="text-sm text-blue-600 underline" disabled={locationStatus === 'loading'}>
              {locationStatus === 'loading' ? 'Getting location...' : 'Refresh location'}
            </button></div>
    <div className="flex items-center gap-2 text-gray-600 mt-4">
      <MapPin className="w-5 h-5 text-red-500" />
      <span className="text-center">
        {locationDetails}
      </span>
    </div>

    {/* Punch In Details */}

   {!state.is_punched_in ? (

  <div className="w-full mt-8 space-y-5">

    <h3 className="text-lg font-semibold text-left">
      Punch In Details
    </h3>

    <div>
      <label className="block text-sm font-medium mb-2">
        Photo
      </label>

      <div className="flex gap-3">

        <button
          type="button"
          className="btn-primary px-4 py-2"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose Photo
        </button>

        {photoInPreview && (
          <button
            type="button"
            className="btn-muted px-4 py-2"
            onClick={() => {
              setPhotoInPreview(null)
              setPhotoInFile(null)
            }}
          >
            Remove
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoSelection}
        />

      </div>
    </div>

    <div>
      <label className="block text-sm font-medium mb-2">
        Odometer In
      </label>

      <input
        value={odometerIn}
        onChange={(e) => setOdometerIn(e.target.value)}
        className="w-full border rounded px-3 py-2"
        placeholder="Enter odometer"
      />
    </div>

    <div>
      <label className="block text-sm font-medium mb-2">
        Notes
      </label>

      <textarea
        value={remarkIn}
        onChange={(e) => setRemarkIn(e.target.value)}
        className="w-full border rounded px-3 py-2 min-h-[90px]"
        placeholder="Add notes"
      />
    </div>

  </div>

) : (

  <div className="w-full mt-8 space-y-5">

    <h3 className="text-lg font-semibold text-left">
      Punch Out Details
    </h3>

    <div>
      <label className="block text-sm font-medium mb-2">
        Odometer Out
      </label>

      <input
        value={odometerOut}
        onChange={(e) => setOdometerOut(e.target.value)}
        className="w-full border rounded px-3 py-2"
        placeholder="Enter odometer"
      />
    </div>

    <div>
      <label className="block text-sm font-medium mb-2">
        Notes
      </label>

      <textarea
        value={remarkOut}
        onChange={(e) => setRemarkOut(e.target.value)}
        className="w-full border rounded px-3 py-2 min-h-[90px]"
        placeholder="Add notes"
      />
    </div>

    <div>
      <label className="block text-sm font-medium mb-2">
        Photo
      </label>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
      />
    </div>

  </div>

)}

    <div className="mt-8">

      {!state.is_punched_in ? (

        <button
          onClick={handlePunchIn}
          disabled={loading || gettingLocation}
          className="btn-primary px-12 py-4 flex items-center gap-3 mx-auto"
        >
          <LogIn className="w-5 h-5" />
          {gettingLocation
            ? "Getting Location..."
            : loading
            ? "Punching In..."
            : "Punch In"}
        </button>

      ) : (

        <button
          onClick={handlePunchOut}
          className="btn-danger px-12 py-4 flex items-center gap-3 mx-auto"
        >
          <LogOut className="w-5 h-5" />
          {gettingLocation
        ? "Getting Location..."
        : loading
        ? "Punching Out..."
        : "Punch Out"}
        </button>

      )}

    </div>

  </div>

</div>

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
                  <p className="text-sm font-semibold">{r.duration || (r.total_hours ? `${r.total_hours} hrs` : '—')}</p>
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
