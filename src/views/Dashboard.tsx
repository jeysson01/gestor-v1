import { useMemo } from 'react'
import { IconTrophy } from '../components/Icons'
import { useInventory } from '../context/InventoryContext'
import { soles } from '../lib/format'

export function Dashboard() {
  const { purchases } = useInventory()
  const total = purchases.reduce((sum, purchase) => sum + purchase.total, 0)
  const days = useMemo(() => lastSevenDays(purchases), [purchases])
  const weekCount = days.reduce((sum, day) => sum + day.count, 0)
  const ranking = useMemo(() => topSuppliers(purchases), [purchases])

  return (
    <section className="page">
      <header className="page-head">
        <h1>Dashboard</h1>
        <p>Bienvenido a tu sistema de gestión de inventario</p>
      </header>
      <div className="stats">
        <article className="card stat">
          <h2>Total Compras</h2>
          <strong>{purchases.length}</strong>
          <p>Compras registradas</p>
        </article>
        <article className="card stat">
          <h2>Monto Total</h2>
          <strong>{soles(total)}</strong>
          <p>Inversión total</p>
        </article>
        <article className="card stat">
          <h2>Métricas</h2>
          {weekCount === 0 ? (
            <>
              <p className="metric-empty">Sin compras en los últimos 7 días</p>
              <p>Compras registradas por día (últimos 7 días)</p>
            </>
          ) : (
            <ul className="bars">
              {days.map((day) => (
                <li key={day.key}>
                  <span>{day.label}</span>
                  <span className="bar-track">
                    <span style={{ width: `${Math.max(8, (day.count / Math.max(...days.map((item) => item.count), 1)) * 100)}%` }} />
                  </span>
                  <b>{day.count}</b>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
      <article className="card ranking">
        <h2>
          <IconTrophy /> Top 3 proveedores por gasto
        </h2>
        <p>Proveedores con mayor monto total en compras registradas</p>
        {ranking.length === 0 ? (
          <p className="empty-copy">Aún no hay compras con proveedor para mostrar el ranking.</p>
        ) : (
          <ol className="rank-list">
            {ranking.map((row) => (
              <li key={row.supplier}>
                <span>{row.supplier}</span>
                <b>{soles(row.total)}</b>
              </li>
            ))}
          </ol>
        )}
      </article>
    </section>
  )
}

function lastSevenDays(purchases: Array<{ purchasedAt: string }>) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    const count = purchases.filter((purchase) => sameDay(purchase.purchasedAt, date)).length
    return {
      key,
      label: date.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit' }),
      count,
    }
  })
}

function sameDay(iso: string, day: Date) {
  const date = new Date(iso)
  return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate()
}

function topSuppliers(purchases: Array<{ supplier: string; total: number }>) {
  const totals = new Map<string, number>()
  for (const purchase of purchases) {
    const supplier = purchase.supplier.trim()
    if (!supplier) continue
    totals.set(supplier, (totals.get(supplier) ?? 0) + purchase.total)
  }
  return [...totals.entries()]
    .map(([supplier, total]) => ({ supplier, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
}
