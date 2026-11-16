import { lazy, Suspense, useState, type ReactNode } from 'react'
import { IconCart, IconDashboard, IconGear, IconKiosk, IconLogout, IconPhone, IconBox } from '../components/Icons'
import { useInventory } from '../context/InventoryContext'
import { businessPhone } from '../lib/format'
import { logout } from '../lib/auth'

const Dashboard = lazy(() => import('../views/Dashboard').then((mod) => ({ default: mod.Dashboard })))
const Products = lazy(() => import('../views/Products').then((mod) => ({ default: mod.Products })))
const Purchases = lazy(() => import('../views/Purchases').then((mod) => ({ default: mod.Purchases })))
const Reports = lazy(() => import('../views/Reports').then((mod) => ({ default: mod.Reports })))
const Kiosk = lazy(() => import('../views/Kiosk').then((mod) => ({ default: mod.Kiosk })))

export type ViewId = 'dashboard' | 'products' | 'purchases' | 'reports' | 'kiosk'

const NAV: Array<{ id: ViewId; label: string; icon: ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <IconDashboard /> },
  { id: 'products', label: 'Productos', icon: <IconBox /> },
  { id: 'purchases', label: 'Compras', icon: <IconCart /> },
  { id: 'reports', label: 'Reportes', icon: <IconGear /> },
  { id: 'kiosk', label: 'Kiosko', icon: <IconKiosk /> },
]

export function Shell({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<ViewId>('dashboard')
  const [phoneOpen, setPhoneOpen] = useState(true)
  const { online, syncing, pending, syncError, cloud, notice, clearNotice } = useInventory()
  const connection = syncing ? 'Sincronizando' : !cloud ? 'Local' : online ? 'En línea' : 'Sin conexión'

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Inventario Pro</div>
        <nav className="nav">
          {NAV.map((item) => (
            <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)} type="button">
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="header-right">
          <span className={`conn ${online ? 'on' : 'off'}`}>{connection}</span>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              void logout().then(onLogout)
            }}
          >
            <IconLogout /> Salir
          </button>
        </div>
      </header>
      <main className="main">
        {phoneOpen && view !== 'kiosk' && (
          <aside className="phone-chip">
            <div className="phone-row">
              <IconPhone />
              <strong>{businessPhone()}</strong>
              <button type="button" className="icon-button" onClick={() => setPhoneOpen(false)} aria-label="Cerrar">
                ×
              </button>
            </div>
            <p>{pending === 0 ? 'Sin compras pendientes' : `${pending} cambio${pending === 1 ? '' : 's'} por sincronizar`}</p>
          </aside>
        )}
        {syncError && <p className="banner">{syncError}. Los datos siguen guardados en este equipo.</p>}
        {notice && (
          <p className={`banner ${notice.tone}`} onClick={clearNotice}>
            {notice.text}
          </p>
        )}
        <Suspense fallback={<section className="page" />}>
          {view === 'dashboard' && <Dashboard />}
          {view === 'products' && <Products />}
          {view === 'purchases' && <Purchases />}
          {view === 'reports' && <Reports />}
          {view === 'kiosk' && <Kiosk />}
        </Suspense>
      </main>
    </div>
  )
}
