export interface ProductFormData {
  name: string
  sku: string
  category: string
  tax_percent: number | ''
  price: number | ''
  max_discount_percent: number | ''
  status: 'active' | 'inactive'
  description: string
  unit: string
}

export interface ProductFormErrors {
  name?: string
  sku?: string
  price?: string
}

export const PRODUCT_CATEGORIES = [
  'Beer', 'Kombucha', 'Liquor', 'Soft Drink', 'Water', 'Juice', 'Snacks', 'Other',
]

export const UNIT_OPTIONS = ['pcs', 'kg', 'ltr', 'box', 'pack', 'dozen']

export const avatarColor = (letter: string) => {
  const colors = [
    'bg-purple-500', 'bg-green-500', 'bg-blue-500', 'bg-orange-500',
    'bg-teal-500', 'bg-pink-500', 'bg-indigo-500', 'bg-yellow-500',
    'bg-red-500', 'bg-cyan-500',
  ]
  return colors[(letter.charCodeAt(0) - 65) % colors.length]
}

export const timeAgo = (dateStr?: string): string => {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}
