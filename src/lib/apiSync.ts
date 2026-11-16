import type { KioskScan, OutboxEntity, Product, Purchase } from '../types'

export type SyncChange = {
  id: number
  entity: OutboxEntity
  entityId: string
  payload: unknown
  createdAt: string
}

export type SyncCursors = {
  products: string
  purchases: string
  kioskScans: string
}

export type SyncPull = {
  acceptedIds: number[]
  products: Product[]
  purchases: Purchase[]
  kioskScans: KioskScan[]
  cursors: SyncCursors
}

const EMPTY_CURSOR = '1970-01-01T00:00:00.000Z'

export function syncApiConfigured(): boolean {
  return Boolean(syncApiUrl())
}

export function syncApiUrl(): string {
  return (import.meta.env.VITE_SYNC_API_URL ?? '').trim().replace(/\/$/, '')
}

export async function pushAndPull(input: {
  deviceId: string
  changes: SyncChange[]
  cursors: SyncCursors
}): Promise<SyncPull> {
  const response = await fetch(`${syncApiUrl()}/sync`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(`La API de sincronización respondió ${response.status}`)
  }
  return normalizePull(await response.json(), input.cursors)
}

function normalizePull(value: unknown, fallback: SyncCursors): SyncPull {
  const body = isRecord(value) ? value : {}
  const cursors = isRecord(body.cursors) ? body.cursors : {}
  return {
    acceptedIds: numberList(body.acceptedIds),
    products: objectList<Product>(body.products),
    purchases: objectList<Purchase>(body.purchases),
    kioskScans: objectList<KioskScan>(body.kioskScans),
    cursors: {
      products: text(cursors.products, fallback.products || EMPTY_CURSOR),
      purchases: text(cursors.purchases, fallback.purchases || EMPTY_CURSOR),
      kioskScans: text(cursors.kioskScans, fallback.kioskScans || EMPTY_CURSOR),
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => typeof item === 'number')
}

function objectList<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is T => typeof item === 'object' && item !== null)
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback
}
