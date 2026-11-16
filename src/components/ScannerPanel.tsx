import { useEffect, useRef, useState } from 'react'
import { beep, startScan } from '../lib/scanner'
import type { ScanHit } from '../types'

export function ScannerPanel({
  continuous,
  onHit,
  onClose,
}: {
  continuous: boolean
  onHit: (hit: ScanHit) => void
  onClose: () => void
}) {
  const onHitRef = useRef(onHit)
  onHitRef.current = onHit
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<ScanHit | null>(null)

  useEffect(() => {
    let cancelled = false
    let stop: (() => Promise<void>) | null = null
    void startScan({
      continuous,
      onHit: (hit) => {
        if (cancelled) return
        setLast(hit)
        beep()
        onHitRef.current(hit)
      },
      onError: (message) => {
        if (!cancelled && message !== 'cancelled') setError(message)
      },
    })
      .then((fn) => {
        stop = fn
        if (cancelled) void fn()
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudo abrir la cámara')
      })
    return () => {
      cancelled = true
      void stop?.()
    }
  }, [continuous])

  return (
    <div className="scanner-panel">
      <div className="scanner-head">
        <strong>Cámara</strong>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar escáner">
          ×
        </button>
      </div>
      <video data-scanner-video className="scanner-video" autoPlay muted playsInline />
      {last && (
        <p className="scan-ms">
          {last.text} · {last.elapsedMs.toFixed(1)} ms · {last.engine}
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
