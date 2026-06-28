import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { inventoryApi } from '../../../services/api'
import type { Product } from '../../../types'
import type { ProductFormData, ProductFormErrors } from '../types'
import { PRODUCT_CATEGORIES, UNIT_OPTIONS } from '../types'

interface Props {
  onClose: () => void
  onSuccess: () => void
  initial?: Product
}

export default function ProductModal({ onClose, onSuccess, initial }: Props) {
  const isEdit = !!initial

  const [form, setForm] = useState<ProductFormData>({
    name: initial?.name ?? '',
    sku: initial?.sku ?? '',
    category: initial?.category ?? '',
    tax_percent: initial?.tax_percent ?? '',
    price: initial?.price ?? '',
    max_discount_percent: initial?.max_discount_percent ?? '',
    status: initial ? (initial.is_active ? 'active' : 'inactive') : 'active',
    description: initial?.description ?? '',
    unit: initial?.unit ?? 'pcs',
  })

  const [errors, setErrors] = useState<ProductFormErrors>({})
  const [saving, setSaving] = useState(false)

  const update = (key: keyof ProductFormData, value: any) =>
    setForm(f => ({ ...f, [key]: value }))

  const validate = (): ProductFormErrors => {
    const e: ProductFormErrors = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.sku.trim()) e.sku = 'SKU is required'
    if (form.price === '' || Number(form.price) < 0) e.price = 'Selling price is required'
    return e
  }

  const handleSave = async () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        category: form.category || undefined,
        unit: form.unit,
        price: Number(form.price),
        tax_percent: Number(form.tax_percent) || 0,
        max_discount_percent: Number(form.max_discount_percent) || 0,
        is_active: form.status === 'active',
        description: form.description || undefined,
      }
      // Debug: log token and payload to help diagnose Authorization issues in dev
      try {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[ProductModal] creating product, payload=', payload, 'token=', localStorage.getItem('access_token'))
        }
      } catch (e) {}
      if (isEdit && initial) {
        await inventoryApi.updateProduct(initial.id, payload)
        toast.success('Product updated')
      } else {
        await inventoryApi.createProduct(payload)
        toast.success('Product created')
      }
      onSuccess()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
            <h2 className="text-xl font-bold text-gray-900">
              {isEdit ? 'Edit Product' : 'Create Product'}
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                className="input w-full"
                placeholder="Required"
                value={form.name}
                onChange={e => update('name', e.target.value)}
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>

            {/* SKU (auto-visible for edit, required for create) */}
            {!isEdit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU <span className="text-red-500">*</span>
                </label>
                <input
                  className="input w-full"
                  placeholder="e.g. PRD-001"
                  value={form.sku}
                  onChange={e => update('sku', e.target.value)}
                />
                {errors.sku && <p className="text-xs text-red-500 mt-1">{errors.sku}</p>}
              </div>
            )}

            {/* Product Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Category</label>
              <select
                className="input w-full"
                value={form.category}
                onChange={e => update('category', e.target.value)}
              >
                <option value=""></option>
                {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Taxes % */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Taxes %</label>
              <input
                type="number"
                min={0}
                max={100}
                className="input w-full"
                placeholder="Optional"
                value={form.tax_percent}
                onChange={e => update('tax_percent', e.target.value === '' ? '' : parseFloat(e.target.value))}
              />
            </div>

            {/* Selling Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Selling Price <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                className="input w-full"
                placeholder="Required"
                value={form.price}
                onChange={e => update('price', e.target.value === '' ? '' : parseFloat(e.target.value))}
              />
              {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price}</p>}
            </div>

            {/* Maximum Discount % */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Discount %</label>
              <input
                type="number"
                min={0}
                max={100}
                className="input w-full"
                placeholder="Optional"
                value={form.max_discount_percent}
                onChange={e => update('max_discount_percent', e.target.value === '' ? '' : parseFloat(e.target.value))}
              />
            </div>

            {/* Unit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select className="input w-full" value={form.unit} onChange={e => update('unit', e.target.value)}>
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select className="input w-full" value={form.status} onChange={e => update('status', e.target.value as 'active' | 'inactive')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                className="input w-full resize-none"
                rows={3}
                placeholder="Optional"
                value={form.description}
                onChange={e => update('description', e.target.value)}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t px-6 py-4 flex-shrink-0">
            <button onClick={onClose} className="flex-1 border border-gray-300 px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-primary-600 text-white px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-primary-700 transition-colors font-medium"
            >
              {saving ? 'Saving…' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
