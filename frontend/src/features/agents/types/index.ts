export type UserRole = 'admin' | 'manager' | 'field_agent' | 'driver'

export interface AddAgentFormData {
  employee_id: string
  full_name: string
  email: string
  phone: string
  password: string
  role: UserRole
  vehicle_number?: string
  assigned_zone?: string
  manager_id?: number
}

export interface AgentFormErrors {
  employee_id?: string
  full_name?: string
  email?: string
  phone?: string
  password?: string
  role?: string
  vehicle_number?: string
  assigned_zone?: string
}

export const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: 'Admin', value: 'admin' },
  { label: 'Manager', value: 'manager' },
  { label: 'Field Agent', value: 'field_agent' },
  { label: 'Driver', value: 'driver' },
]
