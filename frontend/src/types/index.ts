// ─── Enums ──────────────────────────────────────────────────
export type UserRole = 'admin' | 'manager' | 'field_agent' | 'driver'
export type AgentStatus = 'active' | 'inactive' | 'on_leave'
export type OnlineStatus = 'online' | 'offline'
export type OrderStatus = 'pending' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled' | 'returned'
export type ExpenseStatus = 'pending' | 'approved' | 'rejected'
export type ExpenseCategory = 'fuel' | 'food' | 'accommodation' | 'toll' | 'parking' | 'maintenance' | 'misc'
export type VisitStatus = 'planned' | 'in_progress' | 'completed' | 'missed'

// ─── User ────────────────────────────────────────────────────
export interface User {
  id: number
  employee_id: string
  full_name: string
  email: string
  phone: string
  role: UserRole
  status: AgentStatus
  online_status: OnlineStatus
  profile_photo?: string
  vehicle_number?: string
  assigned_zone?: string
  manager_id?: number
  last_seen?: string
  created_at: string
}

// ─── Auth ────────────────────────────────────────────────────
export interface AuthToken {
  access_token: string
  token_type: string
  user: User
}

// ─── Location ────────────────────────────────────────────────
export interface LocationLog {
  id: number
  agent_id: number
  latitude: number
  longitude: number
  accuracy?: number
  speed?: number
  heading?: number
  address?: string
  is_offline_sync: boolean
  recorded_at: string
  synced_at: string
}

export interface LiveAgent {
  agent_id: number
  full_name: string
  employee_id: string
  vehicle_number?: string
  assigned_zone?: string
  last_seen?: string
  latitude?: number
  longitude?: number
  speed?: number
  address?: string
}

// ─── Punch ───────────────────────────────────────────────────
export interface PunchRecord {
  id: number
  agent_id: number
  punch_in_time?: string
  punch_in_lat?: number
  punch_in_lng?: number
  punch_in_address?: string
  punch_out_time?: string
  punch_out_lat?: number
  punch_out_lng?: number
  punch_out_address?: string
  work_date: string
  total_hours?: number
  distance_covered?: number
  notes?: string
}

// ─── Customer ────────────────────────────────────────────────
export interface Customer {
  id: number
  name: string
  contact_person?: string
  phone: string
  email?: string
  address: string
  city?: string
  state?: string
  pincode?: string
  latitude?: number
  longitude?: number
  customer_type: string
  credit_limit: number
  outstanding_amount: number
  assigned_agent_id?: number
  is_active: boolean
  created_at: string
}

// ─── Visit ───────────────────────────────────────────────────
export interface Visit {
  id: number
  agent_id: number
  customer_id: number
  visit_date: string
  check_in_time?: string
  check_in_lat?: number
  check_in_lng?: number
  check_out_time?: string
  check_out_lat?: number
  check_out_lng?: number
  duration_minutes?: number
  status: VisitStatus
  purpose?: string
  notes?: string
  outcome?: string
  next_follow_up?: string
  created_at: string
  customer?: Customer
}

// ─── Product & Inventory ─────────────────────────────────────
export interface Product {
  id: number
  sku: string
  name: string
  description?: string
  category?: string
  unit: string
  price: number
  tax_percent: number
  max_discount_percent: number
  weight?: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface Inventory {
  id: number
  product_id: number
  warehouse_stock: number
  reorder_level: number
  product?: Product
}

export interface InventoryAssignment {
  id: number
  agent_id: number
  product_id: number
  quantity_loaded: number
  quantity_sold: number
  quantity_returned: number
  assignment_date: string
  notes?: string
  created_at: string
  product?: Product
}

// ─── Order ───────────────────────────────────────────────────
export interface OrderItem {
  id: number
  product_id: number
  quantity: number
  unit_price: number
  discount: number
  total_price: number
  product?: Product
}

export interface Order {
  id: number
  order_number: string
  agent_id: number
  customer_id: number
  visit_id?: number
  status: OrderStatus
  order_date: string
  delivery_date?: string
  subtotal: number
  discount: number
  tax: number
  total_amount: number
  payment_mode: string
  payment_status: string
  delivery_address?: string
  notes?: string
  items: OrderItem[]
  customer?: Customer
}

// ─── Expense ─────────────────────────────────────────────────
export interface Expense {
  id: number
  agent_id: number
  category: ExpenseCategory
  amount: number
  expense_date: string
  description?: string
  receipt_photo?: string
  status: ExpenseStatus
  approved_by?: number
  approved_at?: string
  rejection_reason?: string
  latitude?: number
  longitude?: number
  created_at: string
}

// ─── Odometer ────────────────────────────────────────────────
export interface OdometerLog {
  id: number
  agent_id: number
  log_date: string
  start_reading: number
  end_reading?: number
  distance_travelled?: number
  start_photo?: string
  end_photo?: string
  fuel_added?: number
  fuel_cost?: number
  vehicle_number?: string
  notes?: string
  created_at: string
}

// ─── Dashboard ───────────────────────────────────────────────
export interface DashboardStats {
  total_agents: number
  online_agents: number
  visits_today: number
  orders_today: number
  revenue_today: number
  pending_expenses: number
  total_customers: number
  top_agents: { id: number; name: string; orders: number; revenue: number }[]
  daily_trend: { date: string; orders: number; revenue: number }[]
}
