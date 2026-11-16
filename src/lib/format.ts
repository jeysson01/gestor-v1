export function uid(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function purchaseNumber(): string {
  return `CP-${Date.now()}`
}

export function soles(value: number): string {
  const amount = Number.isFinite(value) ? value : 0
  return `S/ ${amount.toFixed(2)}`
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const day = date.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  let hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const suffix = hours >= 12 ? 'p.m.' : 'a.m.'
  hours = hours % 12
  if (hours === 0) hours = 12
  return `${day}, ${String(hours).padStart(2, '0')}:${minutes} ${suffix}`
}

export function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function businessPhone(): string {
  return import.meta.env.VITE_BUSINESS_PHONE?.trim() || '914713706'
}

export function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
