import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Minus, Plus, Upload, ShoppingCart, CreditCard, AlignJustify, ChevronDown, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { customersApi, ordersApi, inventoryApi } from '../../../services/api'
import type { Customer, Product } from '../../../types'
import type { CreateOrderFormData, OrderProductLine, CollectionLine, PaymentMode } from '../types'
import { PAYMENT_MODES } from '../types'

const uid = () => Math.random().toString(36).slice(2)
const todayStr = () => new Date().toISOString().slice(0, 10)

function calcAmount(line: OrderProductLine): number {
  const base = line.unit_price * line.quantity
  const discount = line.discount_type === 'percent'
    ? (base * line.discount) / 100
    : line.discount
  return Math.max(0, base - discount + (Math.max(0, base - discount) * line.tax_percent) / 100)
}

function newCollection(): CollectionLine {
  return { id: uid(), payment_mode: 'Cash', amount: '', remark: '', attachment: null }
}

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function CreateOrderModal({ onClose, onSuccess }: Props) {
  const [openSection, setOpenSection] = useState<'overview' | 'products' | 'collection'>('overview')
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const [form, setForm] = useState<CreateOrderFormData>({
    customer_id: null,
    customer_name: '',
    order_date: todayStr(),
    products: [],
    collections: [],
  })

  // ── Customer typeahead (same pattern as VisitModal) ─────────
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([])
  const [custLoading, setCustLoading] = useState(false)
  const [custHighlight, setCustHighlight] = useState(-1)
  const customerRef = useRef<HTMLDivElement>(null)

  // ── Product typeahead ────────────────────────────────────────
  const [productSearch, setProductSearch] = useState('')
  const [productOptions, setProductOptions] = useState<Product[]>([])
  const [prodLoading, setProdLoading] = useState(false)
  const [prodHighlight, setProdHighlight] = useState(-1)
  const [showProductSearch, setShowProductSearch] = useState(false)
  const productRef = useRef<HTMLDivElement>(null)
  const [productDropdownStyle, setProductDropdownStyle] = useState<Record<string, any> | null>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node))
        setCustomerOptions([])
      if (productRef.current && !productRef.current.contains(e.target as Node))
        setShowProductSearch(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Compute product dropdown position to avoid clipping by overflow parents
  useEffect(() => {
    if (!showProductSearch || !productRef.current) {
      setProductDropdownStyle(null)
      return
    }
    const inputEl = productRef.current.querySelector('input') as HTMLElement | null
    if (!inputEl) return
    const rect = inputEl.getBoundingClientRect()
    setProductDropdownStyle({ left: rect.left + 'px', top: rect.bottom + 'px', width: rect.width + 'px' })

    const onResize = () => {
      const r = inputEl.getBoundingClientRect()
      setProductDropdownStyle({ left: r.left + 'px', top: r.bottom + 'px', width: r.width + 'px' })
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [showProductSearch, productOptions])

  const searchCustomers = async (q: string) => {
    if (q.length < 2) { setCustomerOptions([]); return }
    setCustLoading(true)
    try {
      const res = await customersApi.list({ search: q })
      setCustomerOptions(res?.data?.data || res?.data || [])
      setCustHighlight(-1)
    } catch { setCustomerOptions([]) }
    finally { setCustLoading(false) }
  }

  const searchProducts = async (q: string) => {
    if (q.length < 1) { setProductOptions([]); return }
    setProdLoading(true)
    try {
      const res = await inventoryApi.products({ search: q })
      setProductOptions(res?.data?.data || res?.data || [])
      setProdHighlight(-1)
    } catch { setProductOptions([]) }
    finally { setProdLoading(false) }
  }

  // ── Derived totals ───────────────────────────────────────────
  const totalDiscount = form.products.reduce((s, p) => {
    const base = p.unit_price * p.quantity
    return s + (p.discount_type === 'percent' ? (base * p.discount) / 100 : p.discount)
  }, 0)
  const totalTax = form.products.reduce((s, p) => {
    const base = p.unit_price * p.quantity
    const disc = p.discount_type === 'percent' ? (base * p.discount) / 100 : p.discount
    return s + Math.max(0, (base - disc) * p.tax_percent / 100)
  }, 0)
  const grossTotal = form.products.reduce((s, p) => s + calcAmount(p), 0)
  const collected = form.collections.reduce((s, c) => s + (Number(c.amount) || 0), 0)
  const due = grossTotal - collected

  // ── Product helpers ──────────────────────────────────────────
  const updateProduct = useCallback((id: string, patch: Partial<OrderProductLine>) => {
    setForm(f => ({
      ...f,
      products: f.products.map(p => {
        if (p.id !== id) return p
        const updated = { ...p, ...patch }
        return { ...updated, amount: calcAmount(updated) }
      }),
    }))
  }, [])

  const addProduct = (product: Product) => {
    setForm(f => ({
      ...f,
      products: [...f.products, {
        id: uid(),
        product_id: product.id,
        product_name: product.name,
        category: product.category ?? '',
        unit_price: product.price,
        quantity: 1,
        discount_type: 'percent',
        discount: 0,
        tax_percent: 0,
        amount: product.price,
      }],
    }))
    setProductSearch('')
    setProductOptions([])
    setShowProductSearch(false)
  }

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    setTouched({ customer_id: true })
    if (!form.customer_id) { toast.error('Please select a customer'); return }
    if (form.products.length === 0) { toast.error('Add at least one product'); return }
    setSaving(true)
    try {
      await ordersApi.create({
        customer_id: form.customer_id,
        order_date: form.order_date,
        items: form.products.map(p => ({
          product_id: p.product_id,
          quantity: p.quantity,
          unit_price: p.unit_price,
          discount: p.discount_type === 'percent'
            ? (p.unit_price * p.quantity * p.discount) / 100
            : p.discount,
          total_price: p.amount,
        })),
        subtotal: grossTotal - totalTax,
        discount: totalDiscount,
        tax: totalTax,
        total_amount: grossTotal,
        payment_mode: form.collections[0]?.payment_mode ?? 'Cash',
        payment_status: collected >= grossTotal ? 'paid' : collected > 0 ? 'partial' : 'unpaid',
      })
      toast.success('Order created successfully')
      onSuccess()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Failed to create order')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
            <h2 className="text-xl font-bold text-gray-900">Create Order</h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

            {/* OVERVIEW */}
            <AccordionSection
              label="Overview"
              icon={<AlignJustify className="w-4 h-4" />}
              open={openSection === 'overview'}
              onToggle={() => setOpenSection(s => s === 'overview' ? 'products' : 'overview')}
            >
              <div className="grid grid-cols-2 gap-4 pt-3">
                {/* Customer */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer <span className="text-red-500">*</span>
                  </label>
                  <div className="relative" ref={customerRef}>
                    <input
                      className="input w-full pr-8"
                      placeholder="Search customer…"
                      value={customerSearch !== '' ? customerSearch : form.customer_name}
                      onChange={e => {
                        const q = e.target.value
                        setCustomerSearch(q)
                        if (q.length > 0) setForm(f => ({ ...f, customer_id: null, customer_name: '' }))
                        searchCustomers(q)
                      }}
                      onBlur={() => setTouched(t => ({ ...t, customer_id: true }))}
                      autoComplete="off"
                    />
                    {(form.customer_name || customerSearch) && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => {
                          setForm(f => ({ ...f, customer_id: null, customer_name: '' }))
                          setCustomerSearch('')
                          setCustomerOptions([])
                        }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {custLoading && <p className="text-xs text-gray-400 mt-1">Searching…</p>}
                    {customerOptions.length > 0 && (
                      <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto z-50">
                        {customerOptions.map((c, idx) => (
                          <div
                            key={c.id}
                            onMouseEnter={() => setCustHighlight(idx)}
                            onClick={() => {
                              setForm(f => ({ ...f, customer_id: c.id, customer_name: c.name }))
                              setCustomerSearch('')
                              setCustomerOptions([])
                            }}
                            className={`px-3 py-2 cursor-pointer text-sm ${idx === custHighlight ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50'}`}
                          >
                            <span className="font-medium">{c.name}</span>
                            {c.phone && <span className="text-gray-400 ml-2 text-xs">{c.phone}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {touched.customer_id && !form.customer_id && (
                    <p className="text-xs text-red-500 mt-1">Customer is required</p>
                  )}
                </div>

                {/* Order Date */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Order Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    className="input w-full"
                    value={form.order_date}
                    onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}
                  />
                </div>
              </div>
            </AccordionSection>

            {/* ADD PRODUCTS */}
            <AccordionSection
              label="Add Products"
              icon={<ShoppingCart className="w-4 h-4" />}
              subtitle={form.products.length > 0 ? `${form.products.length} product${form.products.length > 1 ? 's' : ''} · ₹${grossTotal.toFixed(0)}` : undefined}
              open={openSection === 'products'}
              onToggle={() => setOpenSection(s => s === 'products' ? 'overview' : 'products')}
            >
              <div className="space-y-3 pt-3">
                {form.products.map(line => (
                  <ProductCard
                    key={line.id}
                    line={line}
                    onChange={patch => updateProduct(line.id, patch)}
                    onRemove={() => setForm(f => ({ ...f, products: f.products.filter(p => p.id !== line.id) }))}
                  />
                ))}

                {/* Product inline search */}
                <div ref={productRef} className="relative">
                  {showProductSearch ? (
                    <>
                      <input
                        className="input w-full"
                        placeholder="Search product…"
                        value={productSearch}
                        autoFocus
                        onChange={e => { setProductSearch(e.target.value); searchProducts(e.target.value) }}
                      />
                      {prodLoading && <p className="text-xs text-gray-400 mt-1">Searching…</p>}
                        {productOptions.length > 0 && (
                          <div
                            className="bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto"
                            style={{ position: 'fixed', zIndex: 9999, ...(productDropdownStyle ?? {}) }}
                          >
                          {productOptions.map((p, idx) => (
                            <div
                              key={p.id}
                              onMouseEnter={() => setProdHighlight(idx)}
                              onClick={() => addProduct(p)}
                              className={`px-3 py-2 cursor-pointer text-sm ${idx === prodHighlight ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50'}`}
                            >
                              <span className="font-medium">{p.name}</span>
                              <span className="text-gray-400 ml-2 text-xs">{p.category} · ₹{p.price}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => setShowProductSearch(true)}
                      className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {form.products.length === 0 ? 'Add Product' : 'Add More'}
                    </button>
                  )}
                </div>
              </div>
            </AccordionSection>

            {/* COLLECTION AMOUNT */}
            <AccordionSection
              label="Collection Amount"
              icon={<CreditCard className="w-4 h-4" />}
              subtitle={`₹${collected.toFixed(0)} collected`}
              open={openSection === 'collection'}
              onToggle={() => setOpenSection(s => s === 'collection' ? 'overview' : 'collection')}
            >
              <div className="space-y-3 pt-3">
                {form.collections.map((col, idx) => (
                  <CollectionCard
                    key={col.id}
                    col={col}
                    index={idx}
                    onChange={patch => setForm(f => ({
                      ...f,
                      collections: f.collections.map(c => c.id === col.id ? { ...c, ...patch } : c),
                    }))}
                    onRemove={() => setForm(f => ({ ...f, collections: f.collections.filter(c => c.id !== col.id) }))}
                  />
                ))}
                <button
                  onClick={() => setForm(f => ({ ...f, collections: [...f.collections, newCollection()] }))}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {form.collections.length === 0 ? 'Add Collection' : 'Add More'}
                </button>
              </div>
            </AccordionSection>

            {/* SUMMARY */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3 space-y-1.5">
              <SummaryRow label="Total Amount" value={`₹${grossTotal.toFixed(0)}`} />
              <SummaryRow label="Tax" value={`₹${totalTax.toFixed(0)}`} />
              <SummaryRow label="Discount" value={`- ₹${totalDiscount.toFixed(0)}`} />
              <div className="border-t border-gray-200 pt-1.5">
                <SummaryRow label="Gross Total" value={`₹${grossTotal.toFixed(0)}`} bold />
              </div>
              <SummaryRow label="Collected" value={`₹${collected.toFixed(0)}`} color="text-green-600" />
              {due > 0 && <SummaryRow label="Due" value={`₹${due.toFixed(0)}`} color="text-red-500" />}
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t px-6 py-4 flex-shrink-0">
            <button
              onClick={onClose}
              className="flex-1 border border-gray-300 px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-primary-600 text-white px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-primary-700 transition-colors font-medium"
            >
              {saving ? 'Creating…' : 'Create Order'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Accordion ─────────────────────────────────────────────────
function AccordionSection({
  label, icon, subtitle, open, onToggle, children,
}: {
  label: string
  icon: React.ReactNode
  subtitle?: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="text-primary-600">{icon}</span>
          <span className="font-semibold text-gray-800 text-sm">{label}</span>
          {subtitle && <span className="text-xs text-gray-500 ml-1">· {subtitle}</span>}
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// ── Product card ──────────────────────────────────────────────
function ProductCard({ line, onChange, onRemove }: {
  line: OrderProductLine
  onChange: (patch: Partial<OrderProductLine>) => void
  onRemove: () => void
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-white">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-sm text-gray-900">{line.product_name}</p>
          <p className="text-xs text-gray-400">{line.category || 'General'} · ₹{line.unit_price}</p>
        </div>
        <button onClick={onRemove} className="p-1 hover:bg-gray-100 rounded">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Quantity</label>
          <div className="flex items-center gap-2">
            <button onClick={() => onChange({ quantity: Math.max(1, line.quantity - 1) })} className="border border-gray-300 rounded w-7 h-7 flex items-center justify-center hover:bg-gray-50">
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-8 text-center text-sm font-medium">{line.quantity}</span>
            <button onClick={() => onChange({ quantity: line.quantity + 1 })} className="border border-gray-300 rounded w-7 h-7 flex items-center justify-center hover:bg-gray-50">
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Discount Type</label>
          <div className="flex items-center gap-3 mt-1">
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <input type="radio" name={`dtype-${line.id}`} checked={line.discount_type === 'amount'} onChange={() => onChange({ discount_type: 'amount', discount: 0 })} className="accent-primary-600" />
              ₹
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <input type="radio" name={`dtype-${line.id}`} checked={line.discount_type === 'percent'} onChange={() => onChange({ discount_type: 'percent', discount: 0 })} className="accent-primary-600" />
              %
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">
            {line.discount_type === 'percent' ? 'Discount (%)' : 'Discount (₹)'}
          </label>
          <input type="number" min={0} className="input w-full" value={line.discount || ''} onChange={e => onChange({ discount: parseFloat(e.target.value) || 0 })} placeholder="0" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Tax (%)</label>
          <input type="number" min={0} className="input w-full" value={line.tax_percent || ''} onChange={e => onChange({ tax_percent: parseFloat(e.target.value) || 0 })} placeholder="0" />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <span className="text-sm text-gray-600">Amount</span>
        <span className="text-sm font-bold text-gray-900">₹{calcAmount(line).toFixed(0)}</span>
      </div>
    </div>
  )
}

// ── Collection card ───────────────────────────────────────────
function CollectionCard({ col, index, onChange, onRemove }: {
  col: CollectionLine
  index: number
  onChange: (patch: Partial<CollectionLine>) => void
  onRemove: () => void
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-white">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">Collection {index + 1}</span>
        <button onClick={onRemove} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-400" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Payment Mode</label>
          <select className="input w-full" value={col.payment_mode} onChange={e => onChange({ payment_mode: e.target.value as PaymentMode })}>
            {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Amount</label>
          <input type="number" min={0} className="input w-full" value={col.amount} onChange={e => onChange({ amount: e.target.value === '' ? '' : parseFloat(e.target.value) })} placeholder="0" />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Remark</label>
        <textarea className="input w-full resize-none" rows={2} value={col.remark} onChange={e => onChange({ remark: e.target.value })} />
      </div>

      <label className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors">
        <span className="text-sm text-gray-600 truncate">{col.attachment ? col.attachment.name : 'Collection Attachment'}</span>
        <Upload className="w-4 h-4 text-primary-600 ml-2 flex-shrink-0" />
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => onChange({ attachment: e.target.files?.[0] ?? null })} />
      </label>
    </div>
  )
}

// ── Summary row ───────────────────────────────────────────────
function SummaryRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-gray-900' : 'font-medium'} ${color ?? 'text-gray-800'}`}>{value}</span>
    </div>
  )
}
