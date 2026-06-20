import { useEffect, useState, useRef } from 'react'
import { inventoryApi } from '../services/api'
import type { Inventory, Product, InventoryAssignment } from '../types'
import DataTable from '../components/DataTable'
import { Package, AlertTriangle, Truck } from 'lucide-react'
import toast from 'react-hot-toast'
import ImportTemplateButtons from '../components/ImportTemplateButtons'


export default function InventoryPage() {
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [assignments, setAssignments] = useState<InventoryAssignment[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [tab, setTab] = useState<'warehouse' | 'assignments' | 'products'>('warehouse')
  const [loading, setLoading] = useState(true)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [importResult, setImportResult] = useState<any | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      inventoryApi.warehouse(),
      inventoryApi.assignments(),
      inventoryApi.products(),
    ])
      .then(([invRes, assignRes, prodRes]) => {
        setInventory(invRes.data)
        setAssignments(assignRes.data)
        setProducts(prodRes.data)
      })
      .catch(() => toast.error('Failed to load inventory'))
      .finally(() => setLoading(false))
  }, [])

  const lowStockCount = inventory.filter((i) => i.warehouse_stock <= i.reorder_level).length

  const warehouseCols = [
    {
      header: 'SKU',
      render: (row: Inventory) => row.product?.sku ?? '—',
    },
    {
      header: 'Product',
      render: (row: Inventory) => row.product?.name ?? '—',
    },
    {
      header: 'Category',
      render: (row: Inventory) => row.product?.category ?? '—',
    },
    {
      header: 'Unit',
      render: (row: Inventory) => row.product?.unit ?? '—',
    },
    {
      header: 'Price',
      render: (row: Inventory) => row.product ? `₹${row.product.price}` : '—',
    },
    {
      header: 'Stock',
      render: (row: Inventory) => (
        <span className={row.warehouse_stock <= row.reorder_level ? 'text-red-600 font-bold' : 'text-green-700 font-semibold'}>
          {row.warehouse_stock}
        </span>
      ),
    },
    {
      header: 'Reorder Level',
      accessor: 'reorder_level' as keyof Inventory,
    },
    {
      header: 'Status',
      render: (row: Inventory) =>
        row.warehouse_stock <= row.reorder_level ? (
          <span className="badge-red flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Low Stock</span>
        ) : (
          <span className="badge-green">In Stock</span>
        ),
    },
  ]

  const assignmentCols = [
    {
      header: 'Product',
      render: (row: InventoryAssignment) => row.product?.name ?? `#${row.product_id}`,
    },
    { header: 'Date', accessor: 'assignment_date' as keyof InventoryAssignment },
    {
      header: 'Loaded',
      render: (row: InventoryAssignment) => <span className="font-semibold">{row.quantity_loaded}</span>,
    },
    {
      header: 'Sold',
      render: (row: InventoryAssignment) => (
        <span className="text-green-700 font-semibold">{row.quantity_sold}</span>
      ),
    },
    {
      header: 'Returned',
      render: (row: InventoryAssignment) => row.quantity_returned,
    },
    {
      header: 'Balance',
      render: (row: InventoryAssignment) => (
        <span className="font-bold text-blue-700">
          {row.quantity_loaded - row.quantity_sold - row.quantity_returned}
        </span>
      ),
    },
    { header: 'Notes', accessor: 'notes' as keyof InventoryAssignment },
  ]

  const productCols = [
    { header: 'SKU', accessor: 'sku' as keyof Product },
    { header: 'Name', accessor: 'name' as keyof Product },
    { header: 'Category', accessor: 'category' as keyof Product },
    { header: 'Unit', accessor: 'unit' as keyof Product },
    {
      header: 'Price',
      render: (row: Product) => `₹${row.price}`,
    },
    {
      header: 'Status',
      render: (row: Product) => (
        <span className={row.is_active ? 'badge-green' : 'badge-gray'}>
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500 text-sm">{products.length} products · {lowStockCount} low stock alerts</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-2">
            <Package className="w-4 h-4" /> Add Product
          </button>
          <button className="btn-primary flex items-center gap-2">
            <Truck className="w-4 h-4" /> Assign to Truck
          </button>
          <ImportTemplateButtons
            accept=".csv"
            onFile={(f)=>setCsvFile(f)}
            onUpload={async ()=>{
              if(!csvFile) return toast.error('Select CSV')
              setUploadProgress(0); setImportResult(null)
              try{ await new Promise<void>((resolve,reject)=>{ const xhr=new XMLHttpRequest(); xhr.open('POST','/api/inventory/products/import'); const token=localStorage.getItem('access_token'); if(token) xhr.setRequestHeader('Authorization', `Bearer ${token}`); xhr.upload.onprogress=(e)=>{ if(e.lengthComputable) setUploadProgress(Math.round((e.loaded/e.total)*100)) }; xhr.onload=()=>{ if(xhr.status>=200&&xhr.status<300){ setImportResult(JSON.parse(xhr.responseText)); toast.success('Import done'); setCsvFile(null); resolve() } else reject() }; xhr.onerror=()=>reject(); const fd=new FormData(); fd.append('file', csvFile||''); xhr.send(fd) }) }catch(e){ toast.error('Import failed') } finally{ setUploadProgress(null) }
            }}
            templateFilename={'products_template.csv'}
            templateContent={'sku,name,category,warehouse_stock\nSKU1,Product A,category1,100\n'}
          />
        </div>
      </div>

      {/* Low stock alert */}
      {lowStockCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">
            <strong>{lowStockCount} product{lowStockCount > 1 ? 's' : ''}</strong> below reorder level — replenishment needed.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {(['warehouse', 'assignments', 'products'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'warehouse' ? 'Warehouse Stock' : t === 'assignments' ? 'Truck Assignments' : 'Products'}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : tab === 'warehouse' ? (
          <DataTable columns={warehouseCols} data={inventory} emptyMessage="No inventory" />
        ) : tab === 'assignments' ? (
          <DataTable columns={assignmentCols} data={assignments} emptyMessage="No assignments" />
        ) : (
          <DataTable columns={productCols} data={products} emptyMessage="No products" />
        )}
      </div>
      {uploadProgress !== null && <div className="mt-2">Uploading: {uploadProgress}%</div>}
      {importResult && (<div className="mt-3 p-2 border rounded text-sm">Imported: {importResult.imported}<div className="max-h-36 overflow-auto"><table className="w-full text-xs"><tbody>{importResult.results.map((r:any)=>(<tr key={r.row}><td className="pr-2">{r.row}</td><td className="pr-2">{r.status}</td><td>{r.reason||r.id||''}</td></tr>))}</tbody></table></div></div>)}
    </div>
  )
}
