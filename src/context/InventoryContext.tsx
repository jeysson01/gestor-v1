import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Product, Purchase } from '../types'
import { watchConnection } from '../lib/connection'
import { getRepo } from '../lib/db'
import { productFromImport } from '../lib/excel'
import { nowIso } from '../lib/format'
import { syncApiConfigured } from '../lib/apiSync'
import { subscribeRealtime, syncNow } from '../lib/sync'
import { supabaseConfigured } from '../lib/supabase'

type Notice = { tone: 'ok' | 'err'; text: string }

type InventoryValue = {
  ready: boolean
  online: boolean
  syncing: boolean
  pending: number
  syncError: string | null
  cloud: boolean
  products: Product[]
  purchases: Purchase[]
  notice: Notice | null
  clearNotice: () => void
  saveProduct: (product: Product) => Promise<void>
  removeProduct: (id: string) => Promise<void>
  savePurchase: (purchase: Purchase) => Promise<void>
  removePurchase: (id: string) => Promise<void>
  importProducts: (rows: Array<{ code: string; name: string; category: string; unitPrice: number }>) => Promise<number>
}

const InventoryContext = createContext<InventoryValue | null>(null)

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [pending, setPending] = useState(0)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)

  async function reload() {
    const repo = await getRepo()
    const [allProducts, allPurchases, outbox] = await Promise.all([
      repo.allProducts(),
      repo.allPurchases(),
      repo.listOutbox(),
    ])
    setProducts(allProducts.filter((product) => !product.deletedAt))
    setPurchases(allPurchases.filter((purchase) => !purchase.deletedAt))
    setPending(outbox.length)
  }

  async function runSync() {
    setSyncing(true)
    try {
      const state = await syncNow()
      setPending(state.pending)
      setSyncError(state.error)
      await reload()
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    let stopped = false
    void reload()
      .then(() => {
        if (!stopped) setReady(true)
      })
      .catch((error: unknown) => {
        if (!stopped) setNotice({ tone: 'err', text: error instanceof Error ? error.message : 'No se pudo abrir la base local' })
      })
    const stopWatch = watchConnection((next) => {
      setOnline(next)
      if (next) void runSync()
    })
    const stopRealtime = subscribeRealtime(() => void runSync())
    const interval = window.setInterval(() => {
      if (navigator.onLine) void runSync()
    }, 20000)
    return () => {
      stopped = true
      stopWatch()
      stopRealtime()
      window.clearInterval(interval)
    }
    // The sync loop is intentionally started once for the signed-in session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const value = useMemo<InventoryValue>(() => {
    return {
      ready,
      online,
      syncing,
      pending,
      syncError,
      cloud: supabaseConfigured || syncApiConfigured(),
      products,
      purchases,
      notice,
      clearNotice: () => setNotice(null),
      async saveProduct(product) {
        const repo = await getRepo()
        const duplicate = products.find(
          (item) => item.code.toLowerCase() === product.code.trim().toLowerCase() && item.id !== product.id,
        )
        if (duplicate) throw new Error('Ese código ya existe.')
        const next = { ...product, code: product.code.trim(), name: product.name.trim(), updatedAt: nowIso() }
        await repo.upsertProduct(next)
        await reload()
        void runSync()
      },
      async removeProduct(id) {
        const repo = await getRepo()
        const current = (await repo.allProducts()).find((product) => product.id === id)
        if (!current) return
        await repo.upsertProduct({ ...current, deletedAt: nowIso(), updatedAt: nowIso() })
        await reload()
        void runSync()
      },
      async savePurchase(purchase) {
        const repo = await getRepo()
        await repo.upsertPurchase({ ...purchase, updatedAt: nowIso(), deletedAt: null })
        await reload()
        void runSync()
      },
      async removePurchase(id) {
        const repo = await getRepo()
        const current = (await repo.allPurchases()).find((purchase) => purchase.id === id)
        if (!current) return
        await repo.upsertPurchase({ ...current, deletedAt: nowIso(), updatedAt: nowIso() })
        await reload()
        void runSync()
      },
      async importProducts(rows) {
        const repo = await getRepo()
        const existing = await repo.allProducts()
        let count = 0
        for (const row of rows) {
          const found = existing.find((product) => !product.deletedAt && product.code.toLowerCase() === row.code.toLowerCase())
          await repo.upsertProduct(productFromImport(row, found))
          count += 1
        }
        await reload()
        void runSync()
        return count
      },
    }
  }, [ready, online, syncing, pending, syncError, products, purchases, notice])

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
}

export function useInventory(): InventoryValue {
  const value = useContext(InventoryContext)
  if (!value) throw new Error('Inventario no disponible')
  return value
}
