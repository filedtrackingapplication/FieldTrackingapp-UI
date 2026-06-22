import { useEffect, useState, useRef } from 'react'
import { Search, Plus, Minus, LayoutList, LayoutGrid, ArrowDownUp, Pencil, Trash2, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { inventoryApi } from '../../services/api'
import type { Product } from '../../types'
import { useAuthStore } from '../../store/authStore'
import ProductModal from './components/ProductModal'
import DataTable from '../../components/DataTable'
import { avatarColor, timeAgo } from './types'

export default function Products() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const canEdit = user?.role === 'admin' || user?.role === 'manager'

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [sortAsc, setSortAsc] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('All Records')

  const load = () => {
    setLoading(true)
    inventoryApi.products({ search: search || undefined, include_inactive: isAdmin })
      .then(r => setProducts(r.data))
      .catch(() => toast.error('Failed to load products'))
      .finally(() => setLoading(false))
  }

  const _lastLoad = useRef<number>(0)
  useEffect(() => {
    const now = Date.now()
    // Ignore duplicate immediate calls (React strict-mode mounts twice in dev)
    if (now - _lastLoad.current < 150) return
    _lastLoad.current = now
    load()
  }, [search])

  const categories = ['All Records', ...Array.from(new Set(products.map(p => p.category).filter(Boolean) as string[]))]

  const filtered = products
    .filter(p => categoryFilter === 'All Records' || p.category === categoryFilter)
    .sort((a, b) => {
      const da = new Date(a.updated_at ?? a.created_at ?? 0).getTime()
      const db = new Date(b.updated_at ?? b.created_at ?? 0).getTime()
      return sortAsc ? da - db : db - da
    })

  const handleDelete = async (product: Product) => {
    if (!confirm(`Deactivate "${product.name}"?`)) return
    try {
      await inventoryApi.deleteProduct(product.id)
      toast.success('Product deactivated')
      load()
    } catch { toast.error('Failed to delete product') }
  }

  const columns = [
    {
      header: 'Product',
      render: (row: Product) => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor(row.name[0]?.toUpperCase() ?? 'P')}`}>
            {row.name[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{row.name}</p>
            <p className="text-xs text-gray-400">{row.category ?? '—'}</p>
          </div>
        </div>
      ),
    },
    { header: 'SKU', render: (row: Product) => <span className="text-xs text-gray-500">{row.sku}</span> },
    { header: 'Taxes %', render: (row: Product) => row.tax_percent?.toFixed(2) ?? '0.00' },
    { header: 'Max Disc %', render: (row: Product) => row.max_discount_percent?.toFixed(2) ?? '0.00' },
    { header: 'Selling Price', render: (row: Product) => <span className="font-medium">₹{row.price}</span> },
    {
      header: 'Status',
      render: (row: Product) => (
        <span className={row.is_active ? 'badge-green' : 'badge-gray'}>
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    { header: 'Updated', render: (row: Product) => <span className="text-xs text-primary-600">{timeAgo(row.updated_at)}</span> },
    ...(canEdit ? [{
      header: 'Actions',
      render: (row: Product) => (
        <div className="flex items-center gap-2">
          <button onClick={() => setEditProduct(row)} className="p-1 hover:bg-gray-100 rounded text-primary-600">
            <Pencil className="w-4 h-4" />
          </button>
          {isAdmin && (
            <button onClick={() => handleDelete(row)} className="p-1 hover:bg-gray-100 rounded text-red-500">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    }] : []),
  ]

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500 text-sm">{filtered.length} of {products.length} products</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSearch(s => !s)} className="p-2 hover:bg-gray-100 rounded-lg">
            <Search className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={() => setViewMode(v => v === 'list' ? 'card' : 'list')}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title={viewMode === 'list' ? 'Card view' : 'Table view'}
          >
            {viewMode === 'list' ? <LayoutGrid className="w-5 h-5 text-gray-600" /> : <LayoutList className="w-5 h-5 text-gray-600" />}
          </button>
          {canEdit && (
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Product
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <input
          autoFocus
          className="input w-full"
          placeholder="Search by name or SKU…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      )}

      {/* Filter + sort bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ${
                categoryFilter === cat
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-primary-500'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500 hidden sm:block">By: Updated At</span>
          <button
            onClick={() => setSortAsc(s => !s)}
            className="flex items-center gap-1 border border-gray-300 rounded px-2 py-1.5 text-xs hover:bg-gray-50"
          >
            <ArrowDownUp className="w-3.5 h-3.5" />
            {sortAsc ? 'A→Z' : 'Z→A'}
          </button>
          <span className="border border-gray-300 rounded px-2 py-1.5 text-xs font-mono">
            {filtered.length}/{products.length}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : viewMode === 'list' ? (
        /* ── TABLE VIEW ──────────────────────────────────── */
        <div className="card">
          <DataTable columns={columns} data={filtered} emptyMessage="No products found" />
        </div>
      ) : (
        /* ── CARD VIEW (matches screenshot) ─────────────── */
        <div className="space-y-3">
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-12">No products found</p>
          )}
          {filtered.map(product => {
            const letter = product.name[0]?.toUpperCase() ?? 'P'
            const isExpanded = expandedId === product.id
            return (
              <div
                key={product.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                {/* Compact row */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : product.id)}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${avatarColor(letter)}`}>
                    {letter}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{product.name}</p>
                    <p className="text-xs text-gray-500">{product.category ?? '—'}</p>
                  </div>
                  <span className="ml-auto text-primary-600 flex-shrink-0 flex items-center justify-center">
                    {isExpanded ? <Minus className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 flex gap-3">
                    <div className="flex-1 space-y-1.5 text-sm">
                      <DetailRow label="Taxes %" value={(product.tax_percent ?? 0).toFixed(2)} />
                      <DetailRow label="Maximum Discount %" value={(product.max_discount_percent ?? 0).toFixed(2)} />
                      <DetailRow label="Selling Price" value={`₹ ${product.price}`} />
                      <DetailRow label="Updated At" value={product.updated_at ? new Date(product.updated_at).toLocaleString('en-IN') : '—'} />
                      {!product.is_active && (
                        <span className="inline-block badge-gray text-xs mt-1">Inactive</span>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex flex-col gap-3 items-center justify-center pl-2 border-l border-gray-100">
                        <button
                          onClick={() => setEditProduct(product)}
                          className="p-1.5 hover:bg-gray-100 rounded text-primary-600"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(`${product.name} — ₹${product.price}`)
                            toast.success('Copied to clipboard')
                          }}
                          className="p-1.5 hover:bg-gray-100 rounded text-primary-600"
                          title="Share"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(product)}
                            className="p-1.5 hover:bg-gray-100 rounded text-red-500"
                            title="Deactivate"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <ProductModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); load() }} />
      )}
      {editProduct && (
        <ProductModal initial={editProduct} onClose={() => setEditProduct(null)} onSuccess={() => { setEditProduct(null); load() }} />
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  )
}
