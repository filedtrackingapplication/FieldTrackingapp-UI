import { AddAgentFormData, AgentFormErrors } from '../types'

export const validateAgentForm = (data: Partial<AddAgentFormData>): AgentFormErrors => {
  const errors: AgentFormErrors = {}

  // Employee ID
  if (!data.employee_id?.trim()) {
    errors.employee_id = 'Employee ID is required'
  } else if (data.employee_id.trim().length < 2) {
    errors.employee_id = 'Employee ID must be at least 2 characters'
  }

  // Full Name
  if (!data.full_name?.trim()) {
    errors.full_name = 'Full Name is required'
  } else if (data.full_name.trim().length < 2) {
    errors.full_name = 'Full Name must be at least 2 characters'
  }

  // Email
  if (!data.email?.trim()) {
    errors.email = 'Email is required'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Please enter a valid email'
  }

  // Phone
  if (!data.phone?.trim()) {
    errors.phone = 'Phone is required'
  } else if (!/^[0-9+\-\s()]+$/.test(data.phone) || data.phone.replace(/\D/g, '').length < 10) {
    errors.phone = 'Please enter a valid phone number (min 10 digits)'
  }

  // Password
  if (!data.password?.trim()) {
    errors.password = 'Password is required'
  } else if (data.password.length < 6) {
    errors.password = 'Password must be at least 6 characters'
  }

  // Role
  if (!data.role) {
    errors.role = 'Role is required'
  }

  return errors
}

export const validateField = (fieldName: keyof AddAgentFormData, value: any): string => {
  switch (fieldName) {
    case 'employee_id':
      if (!value?.trim()) return 'Employee ID is required'
      if (value.trim().length < 2) return 'Employee ID must be at least 2 characters'
      break
    case 'full_name':
      if (!value?.trim()) return 'Full Name is required'
      if (value.trim().length < 2) return 'Full Name must be at least 2 characters'
      break
    case 'email':
      if (!value?.trim()) return 'Email is required'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email'
      break
    case 'phone':
      if (!value?.trim()) return 'Phone is required'
      if (!/^[0-9+\-\s()]+$/.test(value) || value.replace(/\D/g, '').length < 10)
        return 'Please enter a valid phone number (min 10 digits)'
      break
    case 'password':
      if (!value?.trim()) return 'Password is required'
      if (value.length < 6) return 'Password must be at least 6 characters'
      break
    case 'role':
      if (!value) return 'Role is required'
      break
  }
  return ''
}
