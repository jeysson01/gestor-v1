import { useEffect, useState } from 'react'
import { InventoryProvider } from './context/InventoryContext'
import { Shell } from './components/Shell'
import { restoreSession } from './lib/auth'
import { Login } from './views/Login'

export function App() {
  const [email, setEmail] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    void restoreSession().then((session) => {
      setEmail(session)
      setBooting(false)
    })
  }, [])

  if (booting) return <main className="login-screen">Cargando…</main>
  if (!email) return <Login onSuccess={setEmail} />
  return (
    <InventoryProvider>
      <Shell onLogout={() => setEmail(null)} />
    </InventoryProvider>
  )
}
