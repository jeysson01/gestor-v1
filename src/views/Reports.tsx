import { useRef, useState } from 'react'
import { IconDownload, IconUpload } from '../components/Icons'
import { useInventory } from '../context/InventoryContext'
import { downloadProducts, downloadPurchases, readProductFile } from '../lib/excel'

export function Reports() {
  const { products, purchases, importProducts } = useInventory()
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setMessage(null)
    try {
      const rows = await readProductFile(file)
      if (rows.length === 0) {
        setError('El archivo no tiene filas con Código y Nombre.')
        return
      }
      const count = await importProducts(rows)
      setMessage(`${count} producto${count === 1 ? '' : 's'} importado${count === 1 ? '' : 's'}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo importar')
    }
  }

  return (
    <section className="page">
      <header className="page-head">
        <h1>Reportes</h1>
        <p>Exporta e importa datos del sistema en Excel</p>
      </header>
      <div className="report-grid">
        <article className="card">
          <h2>Reporte de Productos</h2>
          <p>Exporta el listado completo de productos a Excel</p>
          <button className="btn-primary full" type="button" onClick={() => void downloadProducts(products)}>
            <IconDownload /> Descargar Productos
          </button>
        </article>
        <article className="card">
          <h2>Reporte de Compras</h2>
          <p>Exporta el historial de compras y su detalle a Excel</p>
          <button className="btn-primary full" type="button" onClick={() => void downloadPurchases(purchases)}>
            <IconDownload /> Descargar Compras
          </button>
        </article>
      </div>
      <article className="card import-card">
        <h2>Importar Productos</h2>
        <p>Carga productos desde un archivo Excel (.xlsx). Usa las columnas: Código, Nombre, categoria, Precio Unitario (como en la exportación).</p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={(event) => {
            void onFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <button className="btn-file" type="button" onClick={() => fileRef.current?.click()}>
          <IconUpload /> Seleccionar archivo Excel
        </button>
        {message && <p className="scan-ms">{message}</p>}
        {error && <p className="form-error">{error}</p>}
      </article>
    </section>
  )
}
