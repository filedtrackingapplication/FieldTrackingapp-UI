import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'
import Layout from './components/Layout'
import OfflineIndicator from './components/OfflineIndicator'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import LiveTracking from './pages/LiveTracking'
import Agents from './pages/Agents'
import Visits from './pages/Visits'
import Orders from './pages/Orders'
import InventoryPage from './pages/Inventory'
import Expenses from './pages/Expenses'
import Customers from './pages/Customers'
import Odometer from './pages/Odometer'
import PunchInOut from './pages/PunchInOut'
import Reports from './pages/Reports'
import AdminAttendance from './pages/AdminAttendance'
import { useAuthStore } from './store/authStore'

/** Listens for 401 events fired by the axios interceptor and redirects via
 *  React Router (no full-page reload, preserving Zustand state). */
function AuthGuard() {
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  useEffect(() => {
    const handler = () => {
      logout().finally(() => navigate('/login', { replace: true }))
    }
    window.addEventListener('auth:unauthorized', handler)
    return () => window.removeEventListener('auth:unauthorized', handler)
  }, [navigate, logout])
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
          <Route index element={<Dashboard />} />
          <Route path="tracking" element={<LiveTracking />} />
          <Route path="agents" element={<Agents />} />
          <Route path="punch" element={<PunchInOut />} />
          <Route path="visits" element={<Visits />} />
          <Route path="orders" element={<Orders />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="customers" element={<Customers />} />
          <Route path="odometer" element={<Odometer />} />
          <Route path="admin/attendance" element={<AdminAttendance />} />
          <Route path="reports" element={<Reports />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
