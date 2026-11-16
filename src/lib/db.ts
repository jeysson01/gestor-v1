import Dexie, { type Table } from 'dexie'
import type { KioskScan, OutboxEntity, OutboxRow, Product, Purchase, WriteOpts } from '../types'
import { nowIso } from './format'

export interface Repo {
  allProducts(): Promise<Product[]>
  allPurchases(): Promise<Purchase[]>
  recentKioskScans(limit?: number): Promise<KioskScan[]>
  upsertProduct(product: Product, opts?: WriteOpts): Promise<void>
  upsertPurchase(purchase: Purchase, opts?: WriteOpts): Promise<void>
  addKioskScan(scan: KioskScan, opts?: WriteOpts): Promise<void>
  listOutbox(): Promise<OutboxRow[]>
  enqueue(entity: OutboxEntity, entityId: string, payload: unknown): Promise<void>
  setOutboxAttempts(id: number, attempts: number): Promise<void>
  deleteOutbox(ids: number[]): Promise<void>
  getMeta(key: string): Promise<string | null>
  setMeta(key: string, value: string): Promise<void>
}

class InventoryDB extends Dexie {
  products!: Table<Product, string>
  purchases!: Table<Purchase, string>
  kioskScans!: Table<KioskScan, string>
  meta!: Table<{ key: string; value: string }, string>
  syncQueue!: Table<OutboxRow, number>

  constructor() {
    super('inventario-pro')
    this.version(1).stores({
      products: 'id',
      purchases: 'id',
      meta: 'key',
      outbox: '++id, entity, entityId',
    })
    this.version(2)
      .stores({
        products: 'id, name, updatedAt',
        purchases: 'id, purchasedAt, updatedAt',
        kioskScans: 'id, scannedAt, code',
        meta: 'key',
        syncQueue: '++id, entity, entityId, createdAt',
        outbox: null,
      })
      .upgrade(async (tx) => {
        const legacy = tx.table<OutboxRow, number>('outbox')
        const queued = await legacy.toArray()
        if (queued.length > 0) await tx.table('syncQueue').bulkAdd(queued)
      })
  }
}

const database = new InventoryDB()
let repoPromise: Promise<Repo> | null = null

export function getRepo(): Promise<Repo> {
  if (!repoPromise) repoPromise = Promise.resolve(openDexie())
  return repoPromise
}

function syncApiEnabled(): boolean {
  return Boolean(import.meta.env.VITE_SYNC_API_URL?.trim())
}

function openDexie(): Repo {
  async function enqueue(entity: OutboxEntity, entityId: string, payload: unknown) {
    await database.transaction('rw', database.syncQueue, async () => {
      const stale = await database.syncQueue.filter((row) => row.entity === entity && row.entityId === entityId).primaryKeys()
      if (stale.length > 0) await database.syncQueue.bulkDelete(stale)
      await database.syncQueue.add({
        entity,
        entityId,
        payload: JSON.stringify(payload),
        attempts: 0,
        createdAt: nowIso(),
      } as OutboxRow)
    })
  }

  return {
    async allProducts() {
      const rows = await database.products.toArray()
      return rows.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    },
    async allPurchases() {
      const rows = await database.purchases.toArray()
      return rows.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))
    },
    async recentKioskScans(limit = 8) {
      return database.kioskScans.orderBy('scannedAt').reverse().limit(limit).toArray()
    },
    async upsertProduct(product, opts) {
      await database.products.put(product)
      if (!opts?.remote) await enqueue('products', product.id, product)
    },
    async upsertPurchase(purchase, opts) {
      await database.purchases.put(purchase)
      if (!opts?.remote) await enqueue('purchases', purchase.id, { purchase, items: purchase.items })
    },
    async addKioskScan(scan, opts) {
      await database.kioskScans.put(scan)
      if (!opts?.remote && syncApiEnabled()) await enqueue('kiosk_scans', scan.id, scan)
    },
    async listOutbox() {
      return database.syncQueue.orderBy('id').toArray()
    },
    enqueue,
    async setOutboxAttempts(id, attempts) {
      await database.syncQueue.update(id, { attempts })
    },
    async deleteOutbox(ids) {
      if (ids.length > 0) await database.syncQueue.bulkDelete(ids)
    },
    async getMeta(key) {
      const row = await database.meta.get(key)
      return row?.value ?? null
    },
    async setMeta(key, value) {
      await database.meta.put({ key, value })
    },
  }
}
