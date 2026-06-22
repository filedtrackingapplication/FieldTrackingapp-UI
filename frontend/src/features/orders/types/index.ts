export type DiscountType = 'amount' | 'percent'
export type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Cheque' | 'Bank Transfer'

export interface OrderProductLine {
  id: string
  product_id: number | null
  product_name: string
  category: string
  unit_price: number
  quantity: number
  discount_type: DiscountType
  discount: number
  tax_percent: number
  amount: number
}

export interface CollectionLine {
  id: string
  payment_mode: PaymentMode
  amount: number | ''
  remark: string
  attachment: File | null
}

export interface CreateOrderFormData {
  customer_id: number | null
  customer_name: string
  order_date: string
  products: OrderProductLine[]
  collections: CollectionLine[]
}

export const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Card', 'Cheque', 'Bank Transfer']
