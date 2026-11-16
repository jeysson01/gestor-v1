import { useEffect, useRef, useState } from 'react'
import { ScannerPanel } from '../components/ScannerPanel'
import { useInventory } from '../context/InventoryContext'
import { getRepo } from '../lib/db'
import { decodeStill } from '../lib/scanner'
import { nowIso, soles, uid } from '../lib/format'
import type { ScanHit } from '../types'

type Lookup = ScanHit & { name: string; price: number | null; found: boolean }

export function Kiosk() {
  const { products } = useInventory()
  const [live, setLive] = useState(false)
  const [history, setHistory] = useState<Lookup[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void getRepo().then(async (repo) => {
      const scans = await repo.recentKioskScans(8)
      setHistory(
        scans.map((scan) => ({
          text: scan.code,
          format: scan.format,
          elapsedMs: scan.elapsedMs,
          engine: scan.engine,
          name: scan.name,
          price: scan.price,
          found: scan.found,
        })),
      )
    })
  }, [])

  function remember(hit: ScanHit) {
    const product = products.find((item) => item.code.toLowerCase() === hit.text.toLowerCase())
    const entry: Lookup = {
      ...hit,
      name: product?.name ?? 'Producto no registrado',
      price: product ? product.unitPrice : null,
      found: Boolean(product),
    }
    setHistory((current) => [entry, ...current.filter((item) => item.text !== hit.text)].slice(0, 8))
    setError(null)
    void getRepo().then((repo) =>
      repo.addKioskScan({
        id: uid(),
        code: hit.text,
        format: hit.format,
        engine: hit.engine,
        elapsedMs: hit.elapsedMs,
        name: entry.name,
        price: entry.price,
        found: entry.found,
        scannedAt: nowIso(),
      }),
    )
  }

  const latest = history[0]

  return (
    <section className="page kiosk-page">
      <header className="page-head">
        <h1>Kiosko</h1>
        <p>Escaneo continuo con la cámara del equipo. Cada código se decodifica sin bloquear el inventario.</p>
      </header>
      <div className="kiosk-grid">
        <article className="card">
          {!live ? (
            <button className="btn-primary" type="button" onClick={() => setLive(true)}>
              Iniciar escaneo continuo
            </button>
          ) : (
            <ScannerPanel continuous onClose={() => setLive(false)} onHit={remember} />
          )}
          <div className="still-row">
            <input
              ref={fileRef}
              hidden
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                void decodeStill(file).then(remember).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : 'No se pudo leer la imagen')
                })
              }}
            />
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
              Decodificar imagen (ZXing)
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </article>
        <article className="card kiosk-result">
          {latest ? (
            <>
              <p className="eyebrow">{latest.found ? 'Producto' : 'Sin coincidencia'}</p>
              <h2>{latest.name}</h2>
              <p className="code-lg">{latest.text}</p>
              <strong>{latest.price === null ? '—' : soles(latest.price)}</strong>
              <p className="scan-ms">
                {latest.elapsedMs.toFixed(1)} ms · {latest.engine} · {latest.format}
              </p>
            </>
          ) : (
            <>
              <h2>Esperando código</h2>
              <p>Apunta al QR o código de barras. El tiempo que ves es el de la decodificación.</p>
            </>
          )}
        </article>
      </div>
      {history.length > 0 && (
        <ul className="detail-list">
          {history.map((item) => (
            <li key={`${item.text}-${item.elapsedMs}`}>
              <span>
                {item.text} · {item.name}
              </span>
              <b>{item.elapsedMs.toFixed(1)} ms</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
