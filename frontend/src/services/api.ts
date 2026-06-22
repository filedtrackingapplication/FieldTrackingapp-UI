import axios, { AxiosHeaders } from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Bootstrap: set Authorization header immediately from localStorage on module load.
const initToken = localStorage.getItem('access_token')
if (initToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${initToken}`
}

// Called by authStore after login/logout/rehydration to keep axios defaults in sync.
export function setAuthToken(token: string | null) {
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  else delete api.defaults.headers.common['Authorization']
}

window.addEventListener('storage', (e) => {
  if (e.key === 'access_token') setAuthToken(e.newValue)
})

api.interceptors.request.use((config) => {
  // Primary: explicit access_token key set on login
  let token = localStorage.getItem('access_token')
  // Fallback: Zustand persisted auth store (covers page-refresh before setAuthToken fires)
  if (!token) {
    try {
      const stored = localStorage.getItem('auth-storage')
      if (stored) token = JSON.parse(stored)?.state?.token ?? null
    } catch { /* ignore parse errors */ }
  }
  if (token) {
    // Use AxiosHeaders.set() which is the only reliable way to set headers in axios v1.x
    if (config.headers instanceof AxiosHeaders) {
      config.headers.set('Authorization', `Bearer ${token}`)
    } else {
      config.headers = new AxiosHeaders({ ...(config.headers as object), Authorization: `Bearer ${token}` })
    }
    localStorage.setItem('access_token', token)
  }
  return config
})

// Redirect to login on 401 — dispatch a custom event so React Router handles
// the navigation without a full-page reload (which would wipe Zustand state).
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Allow callers to opt-out of triggering a global logout by
      // setting the `X-Skip-Logout` request header.
      const skip = err.config?.headers?.['X-Skip-Logout'] || err.config?.headers?.['x-skip-logout']
      // temporary: log 401 responses to aid debugging
      try { console.warn('[API] 401 response for', err.config?.url) } catch (e) {}
      if (!skip) {
        localStorage.removeItem('access_token')
        window.dispatchEvent(new CustomEvent('auth:unauthorized'))
      }
    }
    return Promise.reject(err)
  }
)

export default api

// ─── Auth ──────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) => {
    const form = new URLSearchParams({ username, password })
    return api.post('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  },
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  register: (data: object) => api.post('/auth/register', data),
}

// ─── Agents ───────────────────────────────────────────────
export const agentsApi = {
  list: (params?: object) => api.get('/agents/', { params }),
  get: (id: number) => api.get(`/agents/${id}`),
  create: (data: object) => api.post('/agents/', data),
  update: (id: number, data: object) => api.put(`/agents/${id}`, data),
  deactivate: (id: number) => api.delete(`/agents/${id}`),
  stats: (id: number) => api.get(`/agents/${id}/stats`),
  onboard: (data: object) => api.post('/agents/onboard', data),
  importCsv: (form: FormData) => api.post('/agents/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

// ─── Tracking ────────────────────────────────────────────
export const trackingApi = {
  live: () => api.get('/tracking/live'),
  history: (agentId: number, params?: object) => api.get(`/tracking/history/${agentId}`, { params }),
  punchIn: (data: object) => api.post('/tracking/punch-in', data),
  punchOut: (data: object) => api.post('/tracking/punch-out', data),
  attendance: (agentId: number, params?: object) => api.get(`/tracking/attendance/${agentId}`, { params }),
  syncLocations: (locations: object[]) => api.post('/tracking/sync', { locations }),
}

// ─── Visits ──────────────────────────────────────────────
export const visitsApi = {
  list: (params?: object) => api.get('/visits/', { params }),
  get: (id: number) => api.get(`/visits/${id}`),
  create: (data: object) => api.post('/visits/', data),
  update: (id: number | string, data: object) => api.put(`/visits/${id}`, data),
  checkIn: (id: number, data: object) => api.post(`/visits/${id}/check-in`, data),
  checkOut: (id: number, data: object) => api.post(`/visits/${id}/check-out`, data),
  summaryToday: () => api.get('/visits/summary/today'),
  onboard: (data: object) => api.post('/visits/onboard', data),
  importCsv: (form: FormData) => api.post('/visits/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

// Visit metadata
export const visitMetaApi = {
  statuses: () => api.get('/visits/meta/statuses'),
  types: () => api.get('/visits/meta/types'),
}

// ─── Orders ──────────────────────────────────────────────
export const ordersApi = {
  list: (params?: object) => api.get('/orders/', { params }),
  get: (id: number) => api.get(`/orders/${id}`),
  create: (data: object) => api.post('/orders/', data),
  update: (id: number, data: object) => api.put(`/orders/${id}`, data),
  analytics: (params?: object) => api.get('/orders/analytics/summary', { params }),
  onboard: (data: object) => api.post('/orders/onboard', data),
  importCsv: (form: FormData) => api.post('/orders/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

// ─── Inventory ───────────────────────────────────────────
export const inventoryApi = {
  // Products listing is called on route navigation and may be hit when a
  // token is expired; avoid triggering a full app logout on a single 401
  // by sending a header that opts out of the global 401 -> logout flow.
  products: (params?: object) => {
    const token = localStorage.getItem('access_token')
    const headers: any = { 'X-Skip-Logout': '1' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return api.get('/inventory/products/', { params, headers })
  },
  createProduct: (data: object) => {
    const token = localStorage.getItem('access_token')
    const headers: any = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    return api.post('/inventory/products/', data, { headers })
  },
  updateProduct: (id: number, data: object) => api.put(`/inventory/products/${id}`, data),
  deleteProduct: (id: number) => api.delete(`/inventory/products/${id}`),
  warehouse: (params?: object) => api.get('/inventory/warehouse/', { params }),
  updateStock: (id: number, data: object) => api.put(`/inventory/warehouse/${id}`, data),
  assignments: (params?: object) => api.get('/inventory/assignments/', { params }),
  assign: (data: object) => api.post('/inventory/assignments/', data),
  updateAssignment: (id: number, data: object) => api.put(`/inventory/assignments/${id}`, data),
  onboardProduct: (data: object) => api.post('/inventory/products/onboard', data),
  importProducts: (form: FormData) => api.post('/inventory/products/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

// ─── Expenses ────────────────────────────────────────────
export const expensesApi = {
  list: (params?: object) => api.get('/expenses/', { params }),
  get: (id: number) => api.get(`/expenses/${id}`),
  create: (formData: FormData) =>
    api.post('/expenses/', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  review: (id: number, data: object) => api.put(`/expenses/${id}/review`, data),
  summary: (params?: object) => api.get('/expenses/summary/by-category', { params }),
  onboard: (data: object) => api.post('/expenses/onboard', data),
  importCsv: (form: FormData) => api.post('/expenses/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

// ─── Customers ───────────────────────────────────────────
export const customersApi = {
  list: (params?: object) => api.get('/customers/', { params }),
  get: (id: number) => api.get(`/customers/${id}`),
  create: (data: object) => api.post('/customers/', data),
  update: (id: number, data: object) => api.put(`/customers/${id}`, data),
  history: (id: number) => api.get(`/customers/${id}/history`),
  onboard: (data: object) => api.post('/customers/onboard', data),
  importCsv: (form: FormData) => api.post('/customers/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

// ─── Odometer ────────────────────────────────────────────
export const odometerApi = {
  list: (params?: object) => api.get('/odometer/', { params }),
  start: (data: object) => api.post('/odometer/start', data),
  close: (id: number, data: object) => api.put(`/odometer/${id}/close`, data),
  summary: (params?: object) => api.get('/odometer/summary', { params }),
}

// ─── Dashboard ───────────────────────────────────────────
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats'),
  agentSummary: (id: number) => api.get(`/dashboard/agent-summary/${id}`),
}

// ─── Admin Attendance ─────────────────────────────────────
export const adminAttendanceApi = {
  list: (params?: object) => api.get('/admin/attendance/', { params }),
  adjust: (id: number, data: object) => api.put(`/admin/attendance/${id}`, data),
  export: (params?: object) => api.post('/admin/attendance/export', params, { responseType: 'blob' }),
}
