import type { Product, Purchase } from '../types'
import { nowIso, num, uid } from './format'

type ImportedProduct = {
  code: string
  name: string
  category: string
  unitPrice: number
}

function headerKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export async function downloadProducts(products: Product[]) {
  const XLSX = await import('xlsx')
  const rows = products.map((product) => ({
    Código: product.code,
    Nombre: product.name,
    Categoría: product.category,
    'Precio Unitario': product.unitPrice,
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Productos')
  saveWorkbook(XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer, 'productos.xlsx')
}

export async function downloadPurchases(purchases: Purchase[]) {
  const XLSX = await import('xlsx')
  const rows = purchases.flatMap((purchase) => {
    const base = {
      Número: purchase.number,
      Fecha: purchase.purchasedAt,
      Proveedor: purchase.supplier,
      Total: purchase.total,
      Yape: purchase.yape,
    }
    if (purchase.items.length === 0) {
      return [{ ...base, Código: '', Producto: '', Cantidad: 0, Precio: 0, Subtotal: 0 }]
    }
    return purchase.items.map((item) => ({
      ...base,
      Código: item.code,
      Producto: item.name,
      Cantidad: item.quantity,
      Precio: item.unitPrice,
      Subtotal: item.subtotal,
    }))
  })
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Compras')
  saveWorkbook(XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer, 'compras.xlsx')
}

function saveWorkbook(bytes: ArrayBuffer, filename: string) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function readProductFile(file: File): Promise<ImportedProduct[]> {
  const XLSX = await import('xlsx')
  const book = XLSX.read(await file.arrayBuffer())
  const sheet = book.Sheets[book.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const imported: ImportedProduct[] = []
  for (const row of rows) {
    const mapped = new Map<string, unknown>()
    for (const [key, value] of Object.entries(row)) mapped.set(headerKey(key), value)
    const code = String(mapped.get('codigo') ?? mapped.get('code') ?? '').trim()
    const name = String(mapped.get('nombre') ?? mapped.get('name') ?? '').trim()
    const category = String(mapped.get('categoria') ?? mapped.get('category') ?? '').trim()
    const unitPrice = num(mapped.get('precio unitario') ?? mapped.get('precio') ?? mapped.get('unit price') ?? 0)
    if (!code || !name) continue
    imported.push({ code, name, category, unitPrice })
  }
  return imported
}

export function productFromImport(row: ImportedProduct, existing?: Product): Product {
  return {
    id: existing?.id ?? uid(),
    code: row.code,
    name: row.name,
    category: row.category,
    unitPrice: row.unitPrice,
    updatedAt: nowIso(),
    deletedAt: null,
  }
}
