import { useState } from 'react'
import { login } from '../lib/auth'
import { supabaseConfigured } from '../lib/supabase'

export function Login({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSuccess(await login(email, password))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo entrar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <p className="eyebrow">Administrador</p>
        <h1>Inventario Pro</h1>
        <p className="muted">Gestión de inventario, compras y escaneo de códigos.</p>
        <label>
          Correo
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        {!supabaseConfigured && (
          <p className="hint">Acceso local: admin@inventario.pro / admin123. Con Supabase se usa el usuario administrador de la nube.</p>
        )}
      </form>
    </main>
  )
}
