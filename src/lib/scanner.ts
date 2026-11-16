import type { ScanHit } from '../types'

export type Engine = 'browser'

type ScanHandlers = {
  continuous: boolean
  onHit: (hit: ScanHit) => void
  onError?: (message: string) => void
}

type BarcodeHit = { rawValue: string; format: string }

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<BarcodeHit[]>
}

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

const FORMATS = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_e', 'upc_a', 'data_matrix', 'pdf417']

function detectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return ctor ?? null
}

export async function detectEngine(): Promise<Engine> {
  return 'browser'
}

export async function startScan(handlers: ScanHandlers): Promise<() => Promise<void>> {
  const preview = document.querySelector<HTMLVideoElement>('[data-scanner-video]')
  if (!preview) throw new Error('No hay vista previa de cámara')
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar la cámara.')
  const video = preview
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false,
  })
  video.srcObject = stream
  await video.play()
  let stopped = false
  let last = ''
  let lastAt = 0
  const Ctor = detectorCtor()
  const detector = Ctor ? new Ctor({ formats: FORMATS }) : null
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  const timer = window.setInterval(async () => {
    if (stopped || !detector || !context || video.readyState < 2) return
    const width = Math.min(video.videoWidth, 960)
    const height = Math.round(video.videoHeight * (width / Math.max(video.videoWidth, 1)))
    canvas.width = width
    canvas.height = height
    context.drawImage(video, 0, 0, width, height)
    const started = performance.now()
    const found = await detector.detect(canvas).catch(() => [])
    const hit = found.find((item) => item.rawValue)
    if (!hit) return
    const now = performance.now()
    if (hit.rawValue === last && now - lastAt < 800) return
    last = hit.rawValue
    lastAt = now
    handlers.onHit({
      text: hit.rawValue,
      format: hit.format,
      elapsedMs: Math.round((performance.now() - started) * 10) / 10,
      engine: 'browser',
    })
    if (!handlers.continuous) void stop()
  }, 90)

  async function stop() {
    if (stopped) return
    stopped = true
    window.clearInterval(timer)
    stream.getTracks().forEach((track) => track.stop())
    video.srcObject = null
  }

  if (!detector) handlers.onError?.('Este navegador no decodifica códigos. Usa Chrome o Edge.')
  return stop
}

export async function decodeStill(file: File): Promise<ScanHit> {
  const Ctor = detectorCtor()
  if (!Ctor) throw new Error('Este navegador no decodifica imágenes. Usa Chrome o Edge.')
  const bitmap = await createImageBitmap(file)
  const started = performance.now()
  const found = await new Ctor({ formats: FORMATS }).detect(bitmap)
  bitmap.close()
  const hit = found.find((item) => item.rawValue)
  if (!hit) throw new Error('No se encontró un código en la imagen.')
  return {
    text: hit.rawValue,
    format: hit.format,
    elapsedMs: Math.round((performance.now() - started) * 10) / 10,
    engine: 'browser',
  }
}

export function beep() {
  tone(880, 0.06, 0.05)
}

export function errorBeep() {
  tone(220, 0.12, 0.04)
}

function tone(frequency: number, seconds: number, volume: number) {
  const audio = new AudioContext()
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  oscillator.frequency.value = frequency
  gain.gain.value = volume
  oscillator.connect(gain).connect(audio.destination)
  oscillator.start()
  oscillator.stop(audio.currentTime + seconds)
  oscillator.onended = () => void audio.close()
}

const CODE_LOCK_MS = 1500

export function commercialBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code)) return false
  const body = code.slice(0, -1)
  let sum = 0
  for (let index = body.length - 1, place = 0; index >= 0; index -= 1, place += 1) {
    sum += Number(body[index]) * (place % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1])
}

export function scanLocked(code: string, locks: Map<string, number>, now = Date.now()): boolean {
  const previous = locks.get(code.trim().toLowerCase()) ?? 0
  return now - previous < CODE_LOCK_MS
}

export function lockScan(code: string, locks: Map<string, number>, now = Date.now()) {
  locks.set(code.trim().toLowerCase(), now)
}
