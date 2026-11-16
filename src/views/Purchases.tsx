import { useMemo, useRef, useState } from 'react'
import { IconCartPlus, IconPlus } from '../components/Icons'
import { ScannerPanel } from '../components/ScannerPanel'
import { commercialBarcode, errorBeep, lockScan, scanLocked } from '../lib/scanner'
import { useInventory } from '../context/InventoryContext'
import { formatDateTime, nowIso, purchaseNumber, soles, toLocalInput, uid } from '../lib/format'
import type { Purchase, PurchaseItem, ScanHit } from '../types'

type DraftLine = PurchaseItem

export function Purchases() {
  const { purchases, products, savePurchase, removePurchase } = useInventory()
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<Purchase | null>(null)

  return (
    <section className="page">
      <header className="page-head">
        <h1>Gestión de Compras</h1>
        <p>Registro y seguimiento de órdenes de compra</p>
      </header>
      <article className="card">
        <div className="card-toolbar">
          <div>
            <h2>Gestión de Compras</h2>
            <p>Órdenes de compra por mayor con varios productos y totales automáticos</p>
          </div>
          <button className="btn-primary" type="button" onClick={() => setOpen(true)}>
            <IconCartPlus /> Compra por mayor
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Acciones</th>
                <th>Número</th>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Total</th>
                <th>Yape</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-empty">
                    No hay compras registradas. Usa "Compra por mayor" para crear la primera.
                  </td>
                </tr>
              ) : (
                purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Eliminar la compra ${purchase.number}?`)) void removePurchase(purchase.id)
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                    <td>{purchase.number}</td>
                    <td>{formatDateTime(purchase.purchasedAt)}</td>
                    <td>{purchase.supplier || '—'}</td>
                    <td>{soles(purchase.total)}</td>
                    <td>{purchase.yape || '—'}</td>
                    <td>
                      <button type="button" onClick={() => setDetail(purchase)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
      {open && <WholesaleSheet products={products} onClose={() => setOpen(false)} onSave={savePurchase} />}
      {detail && (
        <div className="overlay" onMouseDown={() => setDetail(null)}>
          <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{detail.number}</h2>
                <p>
                  {detail.supplier || 'Sin proveedor'} · {formatDateTime(detail.purchasedAt)}
                </p>
              </div>
              <button type="button" className="icon-button" onClick={() => setDetail(null)} aria-label="Cerrar">
                ×
              </button>
            </div>
            <ul className="detail-list">
              {detail.items.map((item) => (
                <li key={item.id}>
                  <span>
                    {item.name} · {item.code}
                  </span>
                  <b>
                    {item.quantity} × {soles(item.unitPrice)} = {soles(item.subtotal)}
                  </b>
                </li>
              ))}
            </ul>
            <p className="total-line">Total {soles(detail.total)}</p>
          </div>
        </div>
      )}
    </section>
  )
}

function WholesaleSheet({
  products,
  onClose,
  onSave,
}: {
  products: Array<{ id: string; code: string; name: string; unitPrice: number }>
  onClose: () => void
  onSave: (purchase: Purchase) => Promise<void>
}) {
  const [number] = useState(purchaseNumber)
  const [purchasedAt, setPurchasedAt] = useState(nowIso)
  const [supplier, setSupplier] = useState('')
  const [yape, setYape] = useState('')
  const [mode, setMode] = useState<'name' | 'code'>('name')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [price, setPrice] = useState(0)
  const [lines, setLines] = useState<DraftLine[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [scanAlert, setScanAlert] = useState<string | null>(null)
  const codeLocks = useRef(new Map<string, number>())
  const [saving, setSaving] = useState(false)

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []
    return products
      .filter((product) =>
        mode === 'code'
          ? product.code.toLowerCase().includes(term)
          : product.name.toLowerCase().includes(term) || product.code.toLowerCase().includes(term),
      )
      .slice(0, 8)
  }, [products, query, mode])

  const selected = products.find((product) => product.id === selectedId) ?? null
  const subtotal = Math.max(0, quantity) * Math.max(0, price)
  const units = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0)

  function choose(product: { id: string; code: string; name: string; unitPrice: number }) {
    setSelectedId(product.id)
    setQuery(mode === 'code' ? product.code : product.name)
    setPrice(product.unitPrice)
  }

  function addScanned(hit: ScanHit) {
    const code = hit.text.trim()
    if (!code || scanLocked(code, codeLocks.current)) return
    const found = products.find((product) => product.code.toLowerCase() === code.toLowerCase())
    if (!found) {
      if (code.length < 7 || !commercialBarcode(code)) return
      lockScan(code, codeLocks.current)
      setScanAlert(`${code} no está en productos`)
      errorBeep()
      return
    }
    lockScan(code, codeLocks.current)
    setLines((current) => {
      const index = current.findIndex((line) => line.code.toLowerCase() === code.toLowerCase())
      if (index >= 0) {
        const line = current[index]
        const quantity = line.quantity + 1
        const next = [...current]
        next[index] = { ...line, quantity, subtotal: quantity * line.unitPrice }
        return next
      }
      return [
        ...current,
        {
          id: uid(),
          purchaseId: '',
          productId: found.id,
          code: found.code,
          name: found.name,
          quantity: 1,
          unitPrice: found.unitPrice,
          subtotal: found.unitPrice,
        },
      ]
    })
    setScanAlert(null)
    setLastScan(`${found.name} · ${hit.elapsedMs.toFixed(1)} ms`)
    setError(null)
  }

  function leaveCamera() {
    setScanning(false)
  }

  function updateLine(id: string, patch: { quantity?: number; unitPrice?: number }) {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line
        const quantity = patch.quantity ?? line.quantity
        const unitPrice = patch.unitPrice ?? line.unitPrice
        return { ...line, quantity, unitPrice, subtotal: quantity * unitPrice }
      }),
    )
  }

  function addLine() {
    if (!selected) {
      setError('Selecciona un producto.')
      return
    }
    if (quantity <= 0) {
      setError('La cantidad debe ser mayor a cero.')
      return
    }
    const line: DraftLine = {
      id: uid(),
      purchaseId: '',
      productId: selected.id,
      code: selected.code,
      name: selected.name,
      quantity,
      unitPrice: price,
      subtotal: quantity * price,
    }
    setLines((current) => [...current, line])
    setError(null)
    setQuery('')
    setSelectedId(null)
    setQuantity(1)
    setPrice(0)
  }

  async function save() {
    if (lines.length === 0) return
    setSaving(true)
    const id = uid()
    try {
      await onSave({
        id,
        number,
        purchasedAt,
        supplier: supplier.trim(),
        yape: yape.trim(),
        total,
        updatedAt: nowIso(),
        deletedAt: null,
        items: lines.map((line) => ({ ...line, purchaseId: id })),
      })
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la compra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="overlay"
      onMouseDown={() => {
        if (scanning) leaveCamera()
        else onClose()
      }}
    >
      {scanning && (
        <div className="scan-stage">
          <button type="button" className="scan-gutter" onClick={leaveCamera}>
            Salir
          </button>
          <div className="scan-center" onMouseDown={(event) => event.stopPropagation()}>
            <ScannerPanel continuous onClose={leaveCamera} onHit={addScanned} />
            <p className="scan-hint">Toca los costados para cerrar la cámara. La compra queda con lo que ya escaneaste.</p>
            <div className="scan-live">
              <span>{lines.length} productos · {units} und.</span>
              <strong>{soles(total)}</strong>
            </div>
            {lastScan && <p className="scan-ms">{lastScan}</p>}
            {scanAlert && <p className="form-error">{scanAlert}</p>}
          </div>
          <button type="button" className="scan-gutter" onClick={leaveCamera}>
            Salir
          </button>
        </div>
      )}
      <div className={`sheet ${scanning ? 'sheet-behind' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>Compra por mayor</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="purchase-meta">
          <label>
            Número de compra
            <input value={number} readOnly />
          </label>
          <label>
            Fecha y hora
            <input type="datetime-local" value={toLocalInput(purchasedAt)} onChange={(event) => setPurchasedAt(new Date(event.target.value).toISOString())} />
          </label>
        </div>
        <div className="add-box">
          <h3>Agregar producto a la lista</h3>
          <label>
            Proveedor
            <input value={supplier} placeholder="Nombre..." onChange={(event) => setSupplier(event.target.value)} />
          </label>
          {scanAlert && <p className="form-error">{scanAlert}</p>}
          <div className="segmented">
            <button type="button" className={mode === 'name' ? 'active' : ''} onClick={() => setMode('name')}>
              Por nombre
            </button>
            <button
              type="button"
              className={mode === 'code' ? 'active' : ''}
              onClick={() => {
                setMode('code')
                setScanning(true)
              }}
            >
              Código / QR
            </button>
          </div>
          <div className="add-grid">
            <label className="grow">
              Producto
              <div className="inline-field">
                <input
                  placeholder={mode === 'code' ? 'Código o escanea QR' : 'Buscar producto...'}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setSelectedId(null)
                  }}
                />
              </div>
              {matches.length > 0 && (
                <ul className="suggest">
                  {matches.map((product) => (
                    <li key={product.id}>
                      <button type="button" onClick={() => choose(product)}>
                        <b>{product.name}</b>
                        <span>{product.code}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </label>
            <label>
              Cantidad
              <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
            </label>
            <label>
              Precio unit.
              <input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(Number(event.target.value))} />
              <span className="subtotal">Subtotal {soles(subtotal)}</span>
            </label>
            <button type="button" className="btn-primary add-btn" onClick={addLine}>
              <IconPlus /> Añadir
            </button>
          </div>
        </div>
        <h3>Productos en esta compra ({lines.length})</h3>
        {lines.length === 0 ? (
          <div className="dashed">Aún no hay productos. Agrega al menos uno para registrar la compra por mayor.</div>
        ) : (
          <ul className="detail-list">
            {lines.map((line) => (
              <li key={line.id} className="cart-line">
                <span className="cart-name">
                  {line.name}
                  <small>{line.code}</small>
                </span>
                <label>
                  Cantidad
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={line.quantity}
                    onChange={(event) => updateLine(line.id, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                  />
                </label>
                <label>
                  Precio unit.
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(event) => updateLine(line.id, { unitPrice: Math.max(0, Number(event.target.value) || 0) })}
                  />
                </label>
                <b>{soles(line.subtotal)}</b>
                <button type="button" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="summary">
          <h3>Resumen total de la compra</h3>
          <div className="summary-grid">
            <div>
              <span>Productos</span>
              <strong>{lines.length}</strong>
            </div>
            <div>
              <span>Unidades</span>
              <strong>{units}</strong>
            </div>
            <div>
              <span>Monto total</span>
              <strong>{soles(total)}</strong>
            </div>
          </div>
          <label>
            Yape
            <input value={yape} placeholder="Referencia opcional" onChange={(event) => setYape(event.target.value)} />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn-primary full" type="button" disabled={lines.length === 0 || saving} onClick={() => void save()}>
          {saving ? 'Guardando…' : `Guardar compra (${soles(total)})`}
        </button>
      </div>
    </div>
  )
}
