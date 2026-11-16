import { useMemo, useState } from 'react'
import { IconCamera, IconPlus } from '../components/Icons'
import { ScannerPanel } from '../components/ScannerPanel'
import { useInventory } from '../context/InventoryContext'
import { nowIso, soles, uid } from '../lib/format'
import type { Product } from '../types'

const EMPTY: Product = {
  id: '',
  code: '',
  name: '',
  category: '',
  unitPrice: 0,
  updatedAt: '',
  deletedAt: null,
}

export function Products() {
  const { products, saveProduct, removeProduct } = useInventory()
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Product | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanNote, setScanNote] = useState<string | null>(null)

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return products
    return products.filter((product) => product.code.toLowerCase().includes(term) || product.name.toLowerCase().includes(term))
  }, [products, query])

  function openCreate() {
    setError(null)
    setScanNote(null)
    setScanning(false)
    setDraft({ ...EMPTY, id: uid(), updatedAt: nowIso() })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    if (!draft.code.trim() || !draft.name.trim()) {
      setError('Código y nombre son obligatorios.')
      return
    }
    try {
      await saveProduct(draft)
      setDraft(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar')
    }
  }

  return (
    <section className="page">
      <header className="page-head">
        <h1>Gestión de Productos</h1>
        <p>Administra el inventario de productos</p>
      </header>
      <article className="card">
        <div className="card-toolbar">
          <div>
            <h2>Gestión de Productos</h2>
            <p>Listado completo de productos en inventario</p>
          </div>
          <button className="btn-primary" type="button" onClick={openCreate}>
            <IconPlus /> Nuevo Producto
          </button>
        </div>
        <input placeholder="Buscar por código o nombre..." value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código-QR</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Precio unitario</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Aún no hay productos. Crea el primero con Nuevo Producto.
                  </td>
                </tr>
              ) : (
                visible.map((product) => (
                  <tr key={product.id}>
                    <td>{product.code}</td>
                    <td>{product.name}</td>
                    <td>{product.category || '—'}</td>
                    <td>{soles(product.unitPrice)}</td>
                    <td className="actions">
                      <button type="button" onClick={() => setDraft(product)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Eliminar ${product.name}?`)) void removeProduct(product.id)
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {draft && (
        <div className="overlay" onMouseDown={() => setDraft(null)}>
          <form className="modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
            <div className="modal-head">
              <div>
                <h2>{draft.updatedAt && products.some((product) => product.id === draft.id) ? 'Editar producto' : 'Crear Nuevo Producto'}</h2>
                <p>Ingresa los detalles del nuevo producto</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setDraft(null)} aria-label="Cerrar">
                ×
              </button>
            </div>
            {scanning && (
              <ScannerPanel
                continuous={false}
                onClose={() => setScanning(false)}
                onHit={(hit) => {
                  setDraft({ ...draft, code: hit.text })
                  setScanNote(`Leído en ${hit.elapsedMs.toFixed(1)} ms (${hit.engine})`)
                  setScanning(false)
                }}
              />
            )}
            <label>
              Código-QR
              <div className="inline-field">
                <input
                  value={draft.code}
                  placeholder="P-001 o escanea QR"
                  onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                />
                <button type="button" className="btn-ghost" onClick={() => setScanning(true)}>
                  <IconCamera /> Cámara
                </button>
              </div>
            </label>
            {scanNote && <p className="scan-ms">{scanNote}</p>}
            <label>
              Nombre
              <input value={draft.name} placeholder="Nombre del producto" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label>
              Categoría de compras
              <input
                value={draft.category}
                placeholder="Ej: Bebidas, Snacks, Limpieza..."
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
              />
            </label>
            <label>
              Precio unitario
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.unitPrice}
                onChange={(event) => setDraft({ ...draft, unitPrice: Number(event.target.value) })}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="btn-primary full" type="submit">
              {products.some((product) => product.id === draft.id) ? 'Guardar cambios' : 'Crear Producto'}
            </button>
          </form>
        </div>
      )}
    </section>
  )
}
