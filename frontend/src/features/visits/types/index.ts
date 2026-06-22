import { Customer } from "@/types"

export type VisitForm = {
  agent_id?: number
  customer_id?: number
  visit_date?: string
  type?: string
  status?: string
  purpose?: string
  notes?: string
}

export type VisitStatus = 'planned' | 'in_progress' | 'completed' | 'missed'

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
export type Option = {
  value: string
  label: string
}

export type Customerdropdown = {
  id: number | string
  name: string
  address?: string
}