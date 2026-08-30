import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { inputCls, PrimaryButton } from '../components/ui'
import { BrandBar, AppFooter } from '../components/Brand'
import jsQR from 'jsqr'

/** Staff scan screen. Camera path uses BarcodeDetector where available and
 * jsQR elsewhere; the manual-entry path is always present and equally
 * first-class, because damaged QRs are a designed-for case (the human-readable
 * ID exists for exactly this - brief section 4).
 *
 * When the camera cannot start the screen says why (no https, permission
 * denied, no camera, camera busy) and offers a retry, instead of a generic
 * "not available" that hid the real cause during testing (30 Aug). */

const CODE_RE = /CLQ-\d{6}/

type CameraState =
  | { kind: 'starting' } | { kind: 'live' }
  | { kind: 'blocked'; reason: 'insecure' | 'denied' | 'none' | 'busy' | 'unsupported' | 'failed' }

const BLOCKED_TEXT: Record<Extract<CameraState, { kind: 'blocked' }>['reason'], string> = {
  insecure: 'The camera only works on a secure (https) address. Open the app at its https address, or type the number below.',
  denied: 'Camera access is blocked for this site. Allow the camera in your browser settings for this address, then tap Try again.',
  none: 'No camera was found on this device. Type the container number below.',
  busy: 'The camera is in use by another app or tab. Close it, then tap Try again.',
  unsupported: 'This browser cannot open the camera. Type the container number below.',
  failed: 'The camera could not start. Tap Try again, or type the number below.',
}

export default function ScanPage() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const next = sp.get('next')
  const go = (code: string) => nav(next ? `${next}${code}` : `/c/${code}`)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState<CameraState>({ kind: 'starting' })
  const [attempt, setAttempt] = useState(0)
  const [manual, setManual] = useState('')

  useEffect(() => {
    let stream: MediaStream | undefined
    let stop = false
    const blocked = (reason: Extract<CameraState, { kind: 'blocked' }>['reason']) => setCamera({ kind: 'blocked', reason })

    async function run() {
      // Camera access needs a secure context: https, or localhost. A LAN
      // address over plain http fails here, silently, on every browser.
      if (!window.isSecureContext) { blocked('insecure'); return }
      if (!navigator.mediaDevices?.getUserMedia) { blocked('unsupported'); return }
      try {
        // "ideal" rather than a hard constraint, so a device with no rear
        // camera (a laptop) still opens the one it has.
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        // React StrictMode runs this effect twice in development; the first
        // run's cleanup fires before getUserMedia resolves. Release the stream
        // rather than leak it, or iOS keeps the camera locked.
        if (stop || !videoRef.current) { stream.getTracks().forEach(t => t.stop()); return }
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCamera({ kind: 'live' })
        // BarcodeDetector where the browser has it (Android Chrome); jsQR on a
        // canvas elsewhere (iOS Safari and Chrome, which lack the API).
        const Detector = (window as any).BarcodeDetector
        const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        let last = 0
        const found = (raw: string) => { const m = raw.toUpperCase().match(CODE_RE); if (m) { go(m[0]); return true } return false }
        const tick = async (t: number) => {
          if (stop || !videoRef.current) return
          if (t - last > 120) {
            last = t
            try {
              const v = videoRef.current
              if (detector) {
                for (const c of await detector.detect(v)) if (found(String(c.rawValue))) return
              } else if (v.videoWidth) {
                const scale = Math.min(1, 640 / v.videoWidth)
                canvas.width = Math.round(v.videoWidth * scale); canvas.height = Math.round(v.videoHeight * scale)
                ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
                const q = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
                if (q && found(q.data)) return
              }
            } catch { /* frame not ready; keep looping */ }
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      } catch (err) {
        const name = (err as { name?: string })?.name ?? ''
        if (name === 'NotAllowedError' || name === 'SecurityError') blocked('denied')
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') blocked('none')
        else if (name === 'NotReadableError' || name === 'AbortError') blocked('busy')
        else blocked('failed')
      }
    }
    run()
    return () => { stop = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [nav, next, attempt])

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault()
    const digits = manual.replace(/\D/g, '').padStart(6, '0')
    if (digits.length === 6) go(`CLQ-${digits}`)
  }

  return (
    <main className="min-h-dvh flex flex-col px-5 pb-6">
      <BrandBar back="/dashboard" />
      <div className="h-5" />

      <section className="relative rounded-2xl overflow-hidden bg-ink aspect-square max-w-md w-full mx-auto">
        {/* The video element is always mounted so the ref exists before the
            stream resolves; it is simply covered while the camera is blocked. */}
        <video ref={videoRef} muted playsInline autoPlay className="w-full h-full object-cover" />
        {camera.kind === 'live' && (
          <div aria-hidden className="absolute inset-0 grid place-items-center">
            <div className="w-3/5 aspect-square border-2 border-paper/80 rounded-2xl" />
          </div>
        )}
        {camera.kind === 'starting' && (
          <div className="absolute inset-0 grid place-items-center bg-ink text-paper/70 px-8 text-center">
            Starting camera
          </div>
        )}
        {camera.kind === 'blocked' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink text-paper/80 px-8 text-center">
            <p>{BLOCKED_TEXT[camera.reason]}</p>
            {camera.reason !== 'insecure' && camera.reason !== 'unsupported' && (
              <button type="button" onClick={() => { setCamera({ kind: 'starting' }); setAttempt(a => a + 1) }}
                className="rounded-xl border border-paper/60 px-5 min-h-[44px] font-medium text-paper">
                Try again
              </button>
            )}
          </div>
        )}
      </section>

      <form onSubmit={submitManual} className="max-w-md w-full mx-auto mt-6 space-y-3">
        <div className="flex items-stretch gap-2">
          <span className="inline-flex items-center rounded-xl border border-line bg-surface px-4 text-lg font-display font-semibold">
            CLQ-
          </span>
          <input
            value={manual}
            onChange={e => setManual(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="000127"
            aria-label="Container number"
            className={inputCls + ' font-display tracking-widest text-xl'}
          />
        </div>
        <PrimaryButton disabled={manual.replace(/\D/g, '').length === 0}>Open container</PrimaryButton>
      </form>
      <AppFooter />
    </main>
  )
}
