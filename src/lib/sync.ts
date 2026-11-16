import type { Product, Purchase, PurchaseItem } from '../types'
import { pushAndPull, syncApiConfigured, type SyncCursors } from './apiSync'
import { getRepo, type Repo } from './db'
import { num, uid } from './format'
import { supabase, supabaseConfigured } from './supabase'

export type SyncState = {
  pending: number
  syncing: boolean
  error: string | null
}

type PurchasePayload = {
  purchase: Purchase
  items: PurchaseItem[]
}

let flight: Promise<SyncState> | null = null

export function syncNow(): Promise<SyncState> {
  if (!flight) {
    flight = runSync().finally(() => {
      flight = null
    })
  }
  return flight
}

async function pendingCount(): Promise<number> {
  const repo = await getRepo()
  return (await repo.listOutbox()).length
}

async function runSync(): Promise<SyncState> {
  const repo = await getRepo()
  if (!navigator.onLine) {
    return { pending: await pendingCount(), syncing: false, error: null }
  }
  if (syncApiConfigured()) {
    try {
      await syncWithApi(repo)
      await repo.setMeta('sync_error', '')
      return { pending: await pendingCount(), syncing: false, error: null }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo sincronizar'
      await repo.setMeta('sync_error', message)
      return { pending: await pendingCount(), syncing: false, error: message }
    }
  }
  if (!supabaseConfigured || !supabase) {
    return { pending: await pendingCount(), syncing: false, error: null }
  }

  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      return { pending: await pendingCount(), syncing: false, error: null }
    }
    await pushOutbox()
    await pullRemote()
    await repo.setMeta('sync_error', '')
    return { pending: await pendingCount(), syncing: false, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo sincronizar'
    await repo.setMeta('sync_error', message)
    return { pending: await pendingCount(), syncing: false, error: message }
  }
}

async function syncWithApi(repo: Repo) {
  const rows = await repo.listOutbox()
  const cursors: SyncCursors = {
    products: (await repo.getMeta('pull_products')) ?? '1970-01-01T00:00:00.000Z',
    purchases: (await repo.getMeta('pull_purchases')) ?? '1970-01-01T00:00:00.000Z',
    kioskScans: (await repo.getMeta('pull_kiosk')) ?? '1970-01-01T00:00:00.000Z',
  }
  const pull = await pushAndPull({
    deviceId: await deviceId(repo),
    changes: rows.map((row) => ({
      id: row.id,
      entity: row.entity,
      entityId: row.entityId,
      payload: JSON.parse(row.payload) as unknown,
      createdAt: row.createdAt,
    })),
    cursors,
  })
  const pendingProducts = new Set(rows.filter((row) => row.entity === 'products').map((row) => row.entityId))
  const pendingPurchases = new Set(rows.filter((row) => row.entity === 'purchases').map((row) => row.entityId))
  const pendingScans = new Set(rows.filter((row) => row.entity === 'kiosk_scans').map((row) => row.entityId))
  await repo.deleteOutbox(pull.acceptedIds.filter((id) => rows.some((row) => row.id === id)))
  for (const product of pull.products) {
    if (pendingProducts.has(product.id)) continue
    await repo.upsertProduct(product, { remote: true })
  }
  for (const purchase of pull.purchases) {
    if (pendingPurchases.has(purchase.id)) continue
    await repo.upsertPurchase(purchase, { remote: true })
  }
  for (const scan of pull.kioskScans) {
    if (pendingScans.has(scan.id)) continue
    await repo.addKioskScan(scan, { remote: true })
  }
  await repo.setMeta('pull_products', pull.cursors.products)
  await repo.setMeta('pull_purchases', pull.cursors.purchases)
  await repo.setMeta('pull_kiosk', pull.cursors.kioskScans)
}

async function deviceId(repo: Repo): Promise<string> {
  const current = await repo.getMeta('device_id')
  if (current) return current
  const created = uid()
  await repo.setMeta('device_id', created)
  return created
}

async function pushOutbox() {
  if (!supabase) return
  const repo = await getRepo()
  const rows = await repo.listOutbox()
  for (const row of rows) {
    try {
      if (row.entity === 'kiosk_scans') continue
      if (row.entity === 'products') {
        const product = JSON.parse(row.payload) as Product
        const { error } = await supabase.from('products').upsert(productToRow(product))
        if (error) throw new Error(error.message)
      } else {
        const payload = JSON.parse(row.payload) as PurchasePayload
        const { error } = await supabase.from('purchases').upsert(purchaseToRow(payload.purchase))
        if (error) throw new Error(error.message)
        const removed = await supabase.from('purchase_items').delete().eq('purchase_id', payload.purchase.id)
        if (removed.error) throw new Error(removed.error.message)
        if (payload.items.length > 0) {
          const inserted = await supabase.from('purchase_items').insert(payload.items.map(itemToRow))
          if (inserted.error) throw new Error(inserted.error.message)
        }
      }
      await repo.deleteOutbox([row.id])
    } catch (error) {
      const attempts = row.attempts + 1
      await repo.setOutboxAttempts(row.id, attempts)
      throw error
    }
  }
}

async function pullRemote() {
  if (!supabase) return
  const repo = await getRepo()
  const outbox = await repo.listOutbox()
  const pendingProducts = new Set(outbox.filter((row) => row.entity === 'products').map((row) => row.entityId))
  const pendingPurchases = new Set(outbox.filter((row) => row.entity === 'purchases').map((row) => row.entityId))

  const productCursor = (await repo.getMeta('pull_products')) ?? '1970-01-01T00:00:00Z'
  const productQuery = await supabase.from('products').select('*').gte('updated_at', productCursor).order('updated_at')
  if (productQuery.error) throw new Error(productQuery.error.message)
  let maxProduct = productCursor
  for (const row of productQuery.data ?? []) {
    if (String(row.updated_at) > maxProduct) maxProduct = String(row.updated_at)
    if (pendingProducts.has(row.id)) continue
    await repo.upsertProduct(rowToProduct(row), { remote: true })
  }
  await repo.setMeta('pull_products', maxProduct)

  const purchaseCursor = (await repo.getMeta('pull_purchases')) ?? '1970-01-01T00:00:00Z'
  const purchaseQuery = await supabase.from('purchases').select('*').gte('updated_at', purchaseCursor).order('updated_at')
  if (purchaseQuery.error) throw new Error(purchaseQuery.error.message)
  const remotePurchases = purchaseQuery.data ?? []
  let maxPurchase = purchaseCursor
  const ids = remotePurchases.map((row) => String(row.id))
  const itemQuery = ids.length
    ? await supabase.from('purchase_items').select('*').in('purchase_id', ids)
    : { data: [], error: null }
  if (itemQuery.error) throw new Error(itemQuery.error.message)
  const itemsByPurchase = new Map<string, PurchaseItem[]>()
  for (const item of itemQuery.data ?? []) {
    const purchaseId = String(item.purchase_id)
    const list = itemsByPurchase.get(purchaseId) ?? []
    list.push(rowToItem(item))
    itemsByPurchase.set(purchaseId, list)
  }
  for (const row of remotePurchases) {
    if (String(row.updated_at) > maxPurchase) maxPurchase = String(row.updated_at)
    if (pendingPurchases.has(row.id)) continue
    const purchase = rowToPurchase(row, itemsByPurchase.get(String(row.id)) ?? [])
    await repo.upsertPurchase(purchase, { remote: true })
  }
  await repo.setMeta('pull_purchases', maxPurchase)
}

export function subscribeRealtime(onChange: () => void): () => void {
  const client = supabase
  if (!client) return () => undefined
  let timer = 0
  const schedule = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(onChange, 400)
  }
  const channel = client
    .channel('inventario-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, schedule)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, schedule)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_items' }, schedule)
    .subscribe()
  return () => {
    window.clearTimeout(timer)
    void client.removeChannel(channel)
  }
}

function productToRow(product: Product) {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    category: product.category,
    unit_price: product.unitPrice,
    updated_at: product.updatedAt,
    deleted_at: product.deletedAt,
  }
}

function purchaseToRow(purchase: Purchase) {
  return {
    id: purchase.id,
    number: purchase.number,
    purchased_at: purchase.purchasedAt,
    supplier: purchase.supplier,
    yape: purchase.yape,
    total: purchase.total,
    updated_at: purchase.updatedAt,
    deleted_at: purchase.deletedAt,
  }
}

function itemToRow(item: PurchaseItem) {
  return {
    id: item.id,
    purchase_id: item.purchaseId,
    product_id: item.productId,
    code: item.code,
    name: item.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    subtotal: item.subtotal,
  }
}

function rowToProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    unitPrice: num(row.unit_price),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  }
}

function rowToItem(row: Record<string, unknown>): PurchaseItem {
  return {
    id: String(row.id),
    purchaseId: String(row.purchase_id),
    productId: row.product_id ? String(row.product_id) : null,
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    quantity: num(row.quantity),
    unitPrice: num(row.unit_price),
    subtotal: num(row.subtotal),
  }
}

function rowToPurchase(row: Record<string, unknown>, items: PurchaseItem[]): Purchase {
  return {
    id: String(row.id),
    number: String(row.number ?? ''),
    purchasedAt: String(row.purchased_at),
    supplier: String(row.supplier ?? ''),
    yape: String(row.yape ?? ''),
    total: num(row.total),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    items,
  }
}
