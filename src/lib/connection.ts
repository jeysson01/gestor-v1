import { syncApiConfigured, syncApiUrl } from './apiSync'
import { supabaseAnonKey, supabaseConfigured, supabaseUrl } from './supabase'

export function watchConnection(onChange: (online: boolean) => void): () => void {
  let stopped = false

  const publish = (online: boolean) => {
    if (!stopped) onChange(online)
  }

  const probe = async () => {
    if (!navigator.onLine) {
      publish(false)
      return
    }
    if (!supabaseConfigured && !syncApiConfigured()) {
      publish(true)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 4000)
    const target = syncApiConfigured() ? `${syncApiUrl()}/health` : `${supabaseUrl()}/auth/v1/health`
    const headers: Record<string, string> = {}
    if (!syncApiConfigured() && supabaseConfigured) headers.apikey = supabaseAnonKey()
    try {
      await fetch(target, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers,
      })
      publish(true)
    } catch {
      publish(false)
    } finally {
      window.clearTimeout(timer)
    }
  }

  const onOnline = () => void probe()
  const onOffline = () => publish(false)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  const interval = window.setInterval(() => void probe(), 10000)
  void probe()

  return () => {
    stopped = true
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    window.clearInterval(interval)
  }
}
