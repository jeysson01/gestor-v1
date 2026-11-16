export type Product = {
  id: string
  code: string
  name: string
  category: string
  unitPrice: number
  updatedAt: string
  deletedAt: string | null
}

export type PurchaseItem = {
  id: string
  purchaseId: string
  productId: string | null
  code: string
  name: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export type Purchase = {
  id: string
  number: string
  purchasedAt: string
  supplier: string
  yape: string
  total: number
  updatedAt: string
  deletedAt: string | null
  items: PurchaseItem[]
}

export type KioskScan = {
  id: string
  code: string
  format: string
  engine: string
  elapsedMs: number
  name: string
  price: number | null
  found: boolean
  scannedAt: string
}

export type OutboxEntity = 'products' | 'purchases' | 'kiosk_scans'

export type OutboxRow = {
  id: number
  entity: OutboxEntity
  entityId: string
  payload: string
  attempts: number
  createdAt: string
}

export type WriteOpts = {
  remote?: boolean
}

export type ScanHit = {
  text: string
  format: string
  elapsedMs: number
  engine: string
}
