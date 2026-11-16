import { supabase, supabaseConfigured } from './supabase'

const SESSION_KEY = 'inventario.session'

type StoredSession = {
  email: string
  mode: 'local' | 'supabase'
}

function readStored(): StoredSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed.email || (parsed.mode !== 'local' && parsed.mode !== 'supabase')) return null
    return parsed
  } catch {
    return null
  }
}

function writeStored(session: StoredSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export async function restoreSession(): Promise<string | null> {
  const stored = readStored()
  if (!stored) return null
  if (stored.mode === 'local') {
    return supabaseConfigured ? null : stored.email
  }
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session.user.email ?? stored.email
  if (!navigator.onLine) return stored.email
  return null
}

export async function login(email: string, password: string): Promise<string> {
  const normalized = email.trim().toLowerCase()
  if (!normalized || !password) {
    throw new Error('Ingresa correo y contraseña.')
  }

  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    })
    if (error || !data.user) {
      throw new Error(error?.message || 'No se pudo iniciar sesión.')
    }
    const sessionEmail = data.user.email ?? normalized
    writeStored({ email: sessionEmail, mode: 'supabase' })
    return sessionEmail
  }

  const expectedEmail = (import.meta.env.VITE_ADMIN_EMAIL || 'admin@inventario.pro').trim().toLowerCase()
  const expectedPassword = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123'
  if (normalized !== expectedEmail || password !== expectedPassword) {
    throw new Error('Correo o contraseña incorrectos.')
  }
  writeStored({ email: normalized, mode: 'local' })
  return normalized
}

export async function logout(): Promise<void> {
  localStorage.removeItem(SESSION_KEY)
  if (supabase) await supabase.auth.signOut()
}
