import { Bell, LogOut, User, Camera } from 'lucide-react'
import { trackingApi } from '../services/api'
import networkManager from '../services/networkManager'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

export default function Header() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [isPunchedIn, setIsPunchedIn] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
    toast.success('Logged out')
  }

  useEffect(() => {
    const load = async () => {
      if (!user) return
      try {
        const res = await trackingApi.attendance(user.id, { month: new Date().getMonth() + 1, year: new Date().getFullYear() })
        const today = new Date().toISOString().split('T')[0]
        const rec = res.data.find((r: any) => r.work_date === today)
        setIsPunchedIn(!!(rec && rec.punch_in_time && !rec.punch_out_time))
      } catch (e) {
        // ignore
      }
    }
    load()
  }, [user])

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div />
      <div className="flex items-center gap-4">
        {/* Online badge */}
        <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Online
        </span>

        <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full">
          <Bell className="w-5 h-5" />
        </button>

        {/* Punch In / Out button */}
        <button
          onClick={async () => {
            const toast = (await import('react-hot-toast')).default
            if (!isPunchedIn) {
              navigate('/punch')
            } else {
              // Punch out: get location and call API
              try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                  if (!navigator.geolocation) reject(new Error('Geolocation not supported'))
                  else navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
                })
                const { latitude, longitude } = pos.coords
                const res = await trackingApi.punchOut({ latitude, longitude })
                // Only update UI when server confirms success
                if (res && (res.status === 200 || res.status === 201 || res.status === 204)) {
                  setIsPunchedIn(false)
                  toast.success('Punched out')
                } else {
                  toast.error('Punch out failed')
                }
              } catch (err: any) {
                const isNetworkErr = !err?.response
                if (isNetworkErr) {
                  // Buffer punch-out for later sync, but retain punched-in state until server confirms
                  await networkManager.bufferPunch({ type: 'punch_out', latitude: 0, longitude: 0, timestamp: new Date().toISOString() })
                  toast('Saved offline — will sync when connected', { icon: '📡' })
                } else {
                  toast.error(err?.response?.data?.detail || err.message || 'Failed to punch out')
                }
              }
            }
          }}
          title={isPunchedIn ? 'Punch Out' : 'Punch In'}
          className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm"
        >
          {isPunchedIn ? 'Punch Out' : 'Punch In'}
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-bold">
            {user?.full_name?.charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium leading-none">{user?.full_name}</p>
            <p className="text-xs text-gray-500">{user?.employee_id}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}

function PunchPhotoHandler({ setIsPunchedIn }: { setIsPunchedIn?: (v: boolean)=>void }) {
  // Render nothing; attach file input listener once
  const attach = () => {
    const inp = document.getElementById('hdr-punch-photo') as HTMLInputElement | null
    if (!inp) return
    inp.onchange = async () => {
      const file = inp.files?.[0]
      if (!file) return
      const toast = (await import('react-hot-toast')).default
      const getLocation = (): Promise<GeolocationPosition> => new Promise((resolve, reject) => {
        if (!navigator.geolocation) reject(new Error('Geolocation not supported'))
        else navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      })
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result))
          r.onerror = reject
          r.readAsDataURL(file)
        })
        let latitude = 0, longitude = 0
        try {
          const pos = await getLocation()
          latitude = pos.coords.latitude
          longitude = pos.coords.longitude
        } catch (e) {
          // continue without coords
        }
        try {
          await trackingApi.punchIn({ latitude, longitude, photo: dataUrl })
          setIsPunchedIn && setIsPunchedIn(true)
          toast.success('Punched in with photo')
        } catch (apiErr: any) {
          const isNetworkErr = !apiErr?.response
          if (isNetworkErr) {
            await networkManager.bufferPunch({ type: 'punch_in', latitude, longitude, photo: dataUrl, timestamp: new Date().toISOString() })
            setIsPunchedIn && setIsPunchedIn(true)
            toast('Saved offline — will sync when connected', { icon: '📡' })
          } else {
            toast.error(apiErr?.response?.data?.detail || apiErr.message || 'Failed to punch in')
          }
        }
      } catch (err: any) {
        ;(await import('react-hot-toast')).default.error(err.message || 'Failed to capture photo')
      } finally {
        // clear input
        if (inp) inp.value = ''
      }
    }
  }
  // attach once
  if (typeof window !== 'undefined') setTimeout(attach, 50)
  return null
}
