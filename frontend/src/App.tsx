import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { lazy, Suspense, useEffect } from 'react'
import Layout from './components/Layout'
import OfflineIndicator from './components/OfflineIndicator'
import Login from './pages/Login'
import { useAuthStore } from './store/authStore'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const LiveTracking = lazy(() => import('./pages/LiveTracking'))
const Agents = lazy(() => import('./features/agents/Agents'))
const Visits = lazy(() => import('./features/visits/Visits'))
const Orders = lazy(() => import('./pages/Orders'))
const InventoryPage = lazy(() => import('./pages/Inventory'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Customers = lazy(() => import('./pages/Customers'))
const Odometer = lazy(() => import('./pages/Odometer'))
const PunchInOut = lazy(() => import('./pages/PunchInOut'))
const Reports = lazy(() => import('./pages/Reports'))
const AdminAttendance = lazy(() => import('./pages/AdminAttendance'))

/** Listens for 401 events fired by the axios interceptor and redirects via
 *  React Router (no full-page reload, preserving Zustand state). */
function AuthGuard() {
  const navigate = useNavigate()
  const { clearAuth } = useAuthStore()
  useEffect(() => {
    const handler = () => {
      // Perform a local-only clear when a 401 occurs to avoid calling
      // the backend logout endpoint (which may itself return 401 and
      // trigger a loop). Then navigate to login.
      clearAuth()
      navigate('/login', { replace: true })
    }
    window.addEventListener('auth:unauthorized', handler)
    return () => window.removeEventListener('auth:unauthorized', handler)
  }, [navigate, clearAuth])
  return null
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, _hasHydrated } = useAuthStore()
  // While Zustand is rehydrating from localStorage, show nothing (prevents
  // a flash-redirect to /login before the persisted token is read).
  if (!_hasHydrated) return null
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthGuard />
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <OfflineIndicator />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Suspense fallback={<div className="p-8">Loading...</div>}><Dashboard /></Suspense>} />
          <Route path="tracking" element={<Suspense fallback={<div className="p-8">Loading...</div>}><LiveTracking /></Suspense>} />
          <Route path="agents" element={<Suspense fallback={<div className="p-8">Loading...</div>}><Agents /></Suspense>} />
          <Route path="punch" element={<Suspense fallback={<div className="p-8">Loading...</div>}><PunchInOut /></Suspense>} />
          <Route path="visits" element={<Suspense fallback={<div className="p-8">Loading...</div>}><Visits /></Suspense>} />
          <Route path="orders" element={<Suspense fallback={<div className="p-8">Loading...</div>}><Orders /></Suspense>} />
          <Route path="inventory" element={<Suspense fallback={<div className="p-8">Loading...</div>}><InventoryPage /></Suspense>} />
          <Route path="expenses" element={<Suspense fallback={<div className="p-8">Loading...</div>}><Expenses /></Suspense>} />
          <Route path="customers" element={<Suspense fallback={<div className="p-8">Loading...</div>}><Customers /></Suspense>} />
          <Route path="odometer" element={<Suspense fallback={<div className="p-8">Loading...</div>}><Odometer /></Suspense>} />
          <Route path="admin/attendance" element={<Suspense fallback={<div className="p-8">Loading...</div>}><AdminAttendance /></Suspense>} />
          <Route path="reports" element={<Suspense fallback={<div className="p-8">Loading...</div>}><Reports /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
