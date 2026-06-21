import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { AddAgentFormData, AgentFormErrors, ROLE_OPTIONS } from '../types'
import { validateAgentForm, validateField } from '../utils/validation'
import { authApi, agentsApi } from '../../../services/api'

interface AddAgentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (agentName: string) => void
  mode?: 'add' | 'edit'
  initialData?: Partial<AddAgentFormData> & { id?: number }
}

// Helper function to extract error message from API response
const getErrorMessage = (error: any): string => {
  if (Array.isArray(error.response?.data?.detail)) {
    const details = error.response.data.detail
    if (details.length > 0) {
      return details[0].msg || JSON.stringify(details[0])
    }
  }

  if (error.response?.data?.detail) {
    return error.response.data.detail
  }

  return 'Failed to create agent'
}

export default function AddAgentModal({
  isOpen,
  onClose,
  onSuccess,
  mode = 'add',
  initialData,
}: AddAgentModalProps) {
  const [formData, setFormData] = useState<AddAgentFormData>({
    employee_id: '',
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'field_agent',
    vehicle_number: '',
    assigned_zone: '',
  })

  const [errors, setErrors] = useState<AgentFormErrors>({})
  const [touched, setTouched] = useState<Set<keyof AddAgentFormData>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [failureMessage, setFailureMessage] = useState<string | null>(null)
  const firstInputRef = useRef<HTMLInputElement | null>(null)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleBlur = (fieldName: keyof AddAgentFormData) => {
    setTouched(prev => new Set([...prev, fieldName]))
    const error = validateField(fieldName, formData[fieldName])
    setErrors(prev => ({ ...prev, [fieldName]: error || undefined }))
  }

  const resetForm = () => {
    if (mode === 'edit' && initialData) {
      setFormData({
        employee_id: initialData.employee_id || '',
        full_name: initialData.full_name || '',
        email: initialData.email || '',
        phone: initialData.phone || '',
        password: '',
        role: (initialData.role as any) || 'field_agent',
        vehicle_number: initialData.vehicle_number || '',
        assigned_zone: initialData.assigned_zone || '',
      })
    } else {
      setFormData({
        employee_id: '',
        full_name: '',
        email: '',
        phone: '',
        password: '',
        role: 'field_agent',
        vehicle_number: '',
        assigned_zone: '',
      })
    }
    setErrors({})
    setTouched(new Set())
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  // Ensure form is cleared whenever modal is opened
  useEffect(() => {
    if (isOpen) resetForm()
  }, [isOpen])

  // Auto-focus the first visible input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        firstInputRef.current?.focus()
      }, 50)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const newErrors = validateAgentForm(formData)
    setErrors(newErrors)

    if (Object.keys(newErrors).length > 0) {
      toast.error('Please fix the errors below')
      return
    }

    // additional email sanitization: disallow unexpected special chars
    const invalidEmailChars = /[^A-Za-z0-9@._+\-]/
    if (formData.email && invalidEmailChars.test(formData.email)) {
      // clear the field and show an error
      setFormData(prev => ({ ...prev, email: '' }))
      setErrors(prev => ({ ...prev, email: 'Email contains invalid characters' }))
      toast.error('Please correct the email')
      return
    }

    setIsSubmitting(true)

    try {
      if (mode === 'edit' && initialData?.id) {
        const payload = {
          full_name: formData.full_name,
          phone: formData.phone,
          role: formData.role,
          vehicle_number: formData.vehicle_number,
          assigned_zone: formData.assigned_zone,
        }
        await agentsApi.update(initialData.id, payload)
        const name = formData.full_name
        setSuccessMessage(`Successfully ${name} saved`)
        onSuccess?.(name)
        setTimeout(() => setSuccessMessage(null), 3000)
      } else {
        await authApi.register(formData)
        const name = formData.full_name
        resetForm()
        setSuccessMessage(`Successfully ${name} saved`)
        onSuccess?.(name)
        setTimeout(() => setSuccessMessage(null), 3000)
      }
    } catch (error: any) {
      const msg = getErrorMessage(error)
      setFailureMessage(msg)
      setTimeout(() => setFailureMessage(null), 3000)
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{mode === 'edit' ? 'Edit Agent' : 'Add New Agent'}</h2>
              {successMessage && (
                <div className="mt-1 text-green-700 font-semibold">{successMessage}</div>
              )}
              {failureMessage && (
                <div className="mt-1 text-red-700 font-semibold">{failureMessage}</div>
              )}
            </div>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6" autoComplete="off">
            <div className="grid grid-cols-2 gap-4 mb-6">

              {/* Employee ID */}
              {mode !== 'edit' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Employee ID *</label>
                  <input
                    ref={firstInputRef}
                    name="employee_id"
                    value={formData.employee_id}
                    onChange={handleChange}
                    onBlur={() => handleBlur('employee_id')}
                    className="w-full px-3 py-2 border rounded-lg"
                    autoComplete="off"
                  />
                  {errors.employee_id && <p className="text-sm text-red-500">{errors.employee_id}</p>}
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Full Name *
                </label>
                <input
                  ref={mode === 'edit' ? firstInputRef : undefined}
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  onBlur={() => handleBlur('full_name')}
                  className="w-full px-3 py-2 border rounded-lg"
                  autoComplete="off"
                />
                {errors.full_name && (
                  <p className="text-sm text-red-500">{errors.full_name}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Email *
                </label>
                <input
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={() => handleBlur('email')}
                  readOnly={mode === 'edit'}
                  className={`w-full px-3 py-2 border rounded-lg ${mode === 'edit' ? 'bg-gray-100' : ''}`}
                  autoComplete="off"
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Phone *
                </label>
                <input
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  onBlur={() => handleBlur('phone')}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                {errors.phone && (
                  <p className="text-sm text-red-500">{errors.phone}</p>
                )}
              </div>

              {/* Password */}
              {mode !== 'edit' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Password *</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    onBlur={() => handleBlur('password')}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  {errors.password && <p className="text-sm text-red-500">{errors.password}</p>}
                </div>
              )}

              {/* Role */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Role *
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  onBlur={() => handleBlur('role')}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vehicle */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Vehicle Number
                </label>
                <input
                  name="vehicle_number"
                  value={formData.vehicle_number}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              {/* Zone */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Assigned Zone
                </label>
                <input
                  name="assigned_zone"
                  value={formData.assigned_zone}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 border-t pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 border px-4 py-2 rounded-lg"
              >
                Close
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg"
              >
                {isSubmitting ? 'Adding...' : 'Add Agent'}
              </button>
            </div>
            {successMessage && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 text-green-800 rounded">
                {successMessage}
              </div>
            )}
          </form>

        </div>
      </div>
    </>
  )
}