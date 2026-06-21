import React, { useEffect, useRef, useState } from 'react'
import Dropdown from '../../../components/Dropdown'
import { customersApi } from '../../../services/api'
import { Option, Customerdropdown } from '../types'
import { getVisitErrors } from '../utils/validation'

type Props = {
  onClose: () => void
  onSave: (data: any) => Promise<void>
  meta: {
    types: Option[]
    statuses: Option[]
  }
  initial?: any
}

export default function VisitModal({
  onClose,
  onSave,
  meta,
  initial,
}: Props) {
  const [form, setForm] = useState({
    agent_id: initial?.agent_id || null,
    customer_id: initial?.customer_id || null,
    customer_label: initial?.customer?.name || '',
    visit_date:
      initial?.visit_date || new Date().toISOString().slice(0, 10),
    type: initial?.type || meta.types?.[0]?.value || '',
    status: initial?.status || meta.statuses?.[0]?.value || '',
    purpose: initial?.purpose || '',
    notes: initial?.notes || '',
    start_datetime: initial?.check_in_time || '',
    end_datetime: initial?.check_out_time || '',
    duration_minutes: initial?.duration_minutes ?? null,
    _search: '',
  })

  // normalize incoming `initial` visit into form-friendly values (datetime-local)
  useEffect(() => {
    if (!initial) return
    const toInput = (v: string | undefined) => {
      if (!v) return ''
      try {
        const d = new Date(v)
        // format YYYY-MM-DDTHH:MM for datetime-local
        const iso = d.toISOString()
        return iso.slice(0, 16)
      } catch {
        return v as string
      }
    }

    setForm((f) => ({
      ...f,
      agent_id: initial.agent_id ?? f.agent_id,
      customer_id: initial.customer_id ?? f.customer_id,
      customer_label: initial.customer?.name ?? f.customer_label,
      visit_date: initial.visit_date ?? f.visit_date,
      start_datetime: toInput(initial.check_in_time as any) || f.start_datetime,
      end_datetime: toInput(initial.check_out_time as any) || f.end_datetime,
      duration_minutes: initial.duration_minutes ?? f.duration_minutes,
      purpose: initial.purpose ?? f.purpose,
      notes: initial.notes ?? f.notes,
      type: initial.type ?? f.type,
      status: initial.status ?? f.status,
    }))
  }, [initial])

  const [customerOptions, setCustomerOptions] = useState<Customerdropdown[]>([])
  const [custSearchLoading, setCustSearchLoading] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setForm((f) => ({
      ...f,
      type: f.type || meta.types?.[0]?.value || '',
      status: f.status || meta.statuses?.[0]?.value || '',
    }))
  }, [meta])

  const update = (key: string, value: any) => {
    setForm((f) => ({
      ...f,
      [key]: value,
    }))
  }

  const computeDuration = (start?: string, end?: string) => {
    const s = start ?? form.start_datetime
    const e = end ?? form.end_datetime

    if (!s || !e) return null

    const diff = new Date(e).getTime() - new Date(s).getTime()
    return Math.max(0, Math.round(diff / 60000))
  }

  useEffect(() => {
    const minutes = computeDuration()
    if (minutes !== null) {
      update('duration_minutes', minutes)
    }
  }, [form.start_datetime, form.end_datetime])

  const searchCustomers = async (query: string) => {
    try {
      setCustSearchLoading(true)

      // backend expects `search` param
      const response = await customersApi.list({ search: query })

      setCustomerOptions(response?.data?.data || response?.data || [])
      setHighlightIndex(-1)
    } catch (error) {
      console.error('Customer search failed:', error)
      setCustomerOptions([])
    } finally {
      setCustSearchLoading(false)
    }
  }

  const getErrors = () => getVisitErrors(form)

  const submit = async () => {
    const errors = getErrors()

    if (Object.keys(errors).length > 0) {
      setTouched({
        customer_id: true,
        start_datetime: true,
        end_datetime: true,
        type: true,
        status: true,
      })
      return
    }

    try {
      setSaving(true)
      await onSave(form)
    } catch (error) {
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setCustomerOptions([])
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const errors = getErrors()

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-bold">
              {initial ? 'Edit Visit' : 'New Visit'}
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4">

              {/* Customer */}
              <div>
                <label className="block text-sm mb-1">
                  Customer <span className="text-red-600">*</span>
                </label>

                <div className="relative" ref={containerRef}>
                  <input
                    className="input w-full pr-10"
                    placeholder="Search customer"
                    value={
                      form._search !== ''
                        ? form._search
                        : form.customer_label || ''
                    }
                    onChange={(e) => {
                      const q = e.target.value
                      update('_search', q)

                      if (q.length > 0) {
                        update('customer_id', null)
                      }

                      if (q.length >= 2) {
                        searchCustomers(q)
                      } else {
                        setCustomerOptions([])
                      }
                    }}
                    onBlur={() =>
                      setTouched((t) => ({ ...t, customer_id: true }))
                    }
                    autoComplete="off"
                  />

                  {(form.customer_label || form._search) && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={() => {
                        update('customer_id', null)
                        update('customer_label', '')
                        update('_search', '')
                        setCustomerOptions([])
                      }}
                    >
                      ×
                    </button>
                  )}

                  {customerOptions.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border rounded shadow-lg max-h-48 overflow-auto z-50">
                      {customerOptions.map((customer, idx) => (
                        <div
                          key={customer.id}
                          className={`p-2 cursor-pointer ${
                            idx === highlightIndex
                              ? 'bg-blue-50'
                              : 'hover:bg-gray-100'
                          }`}
                          onMouseEnter={() => setHighlightIndex(idx)}
                          onClick={() => {
                            update('customer_id', customer.id)
                            update('customer_label', customer.name)
                            update('_search', '')
                            setCustomerOptions([])
                          }}
                        >
                          {customer.name}
                          {customer.address ? ` · ${customer.address}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {custSearchLoading && (
                  <div className="text-xs text-gray-500 mt-1">
                    Searching...
                  </div>
                )}

                {errors.customer_id && touched.customer_id && (
                  <p className="text-xs text-red-600 mt-1">
                    {errors.customer_id}
                  </p>
                )}
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm mb-1">Type</label>
                <Dropdown
                  value={form.type}
                  options={(meta.types || []).map((t) => ({
                    value: t.value,
                    label: t.label,
                  }))}
                  onChange={(value: string) => update('type', value)}
                />
              </div>

              {/* Start */}
              <div>
                <label className="block text-sm mb-1">
                  Start <span className="text-red-600">*</span>
                </label>

                <input
                  type="datetime-local"
                  className="input w-full"
                  value={form.start_datetime}
                  onChange={(e) =>
                    update('start_datetime', e.target.value)
                  }
                />

                {errors.start_datetime && touched.start_datetime && (
                  <p className="text-xs text-red-600 mt-1">
                    {errors.start_datetime}
                  </p>
                )}
              </div>

              {/* End */}
              <div>
                <label className="block text-sm mb-1">
                  End <span className="text-red-600">*</span>
                </label>

                <input
                  type="datetime-local"
                  className="input w-full"
                  value={form.end_datetime}
                  onChange={(e) =>
                    update('end_datetime', e.target.value)
                  }
                />

                {errors.end_datetime && touched.end_datetime && (
                  <p className="text-xs text-red-600 mt-1">
                    {errors.end_datetime}
                  </p>
                )}
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm mb-1">Status</label>
                <Dropdown
                  value={form.status}
                  options={(meta.statuses || []).map((s) => ({
                    value: s.value,
                    label: s.label,
                  }))}
                  onChange={(value: string) => update('status', value)}
                />
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm mb-1">
                  Duration (minutes)
                </label>

                <input
                  type="number"
                  className="input w-full"
                  value={form.duration_minutes ?? ''}
                  disabled
                />
              </div>

              {/* Purpose */}
              <div className="col-span-2">
                <label className="block text-sm mb-1">Purpose</label>
                <input
                  className="input w-full"
                  value={form.purpose}
                  onChange={(e) =>
                    update('purpose', e.target.value)
                  }
                />
              </div>

              {/* Notes */}
              <div className="col-span-2">
                <label className="block text-sm mb-1">Notes</label>
                <textarea
                  className="input w-full min-h-[120px]"
                  value={form.notes}
                  onChange={(e) =>
                    update('notes', e.target.value)
                  }
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t p-6">
            <button
              onClick={onClose}
              className="flex-1 border px-4 py-2 rounded-lg"
            >
              Cancel
            </button>

            <button
              onClick={submit}
              disabled={saving || Object.keys(errors).length > 0}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : initial ? 'Save' : 'Create'}
            </button>
          </div>

        </div>
      </div>
    </>
  )
}