import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { inputCls, PrimaryButton } from '../components/ui'
import { BrandBar, AppFooter } from '../components/Brand'
import jsQR from 'jsqr'

/** Staff scan screen. Camera path uses BarcodeDetector where available;
 * the manual-entry path is always present and equally first-class, because
 * damaged QRs are a designed-for case (the human-readable ID exists for
 * exactly this - brief section 4). */

const CODE_RE = /CLQ-\d{6}/

export default function ScanPage() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const next = sp.get('next')
  const go = (code: string) => nav(next ? `${next}${code}` : `/c/${code}`)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraState, setCameraState] = useState<'starting' | 'live' | 'unavailable'>('starting')
  const [manual, setManual] = useState('')

  useEffect(() => {
    let stream: MediaStream | undefined
    let stop = false
    async function run() {
      if (!navigator.mediaDevices?.getUserMedia) { setCameraState('unavailable'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraState('live')
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
      } catch {
        setCameraState('unavailable')
      }
    }
    run()
    return () => { stop = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [nav, next])

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
        {cameraState !== 'unavailable' && (
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
        )}
        {cameraState === 'live' && (
          <div aria-hidden className="absolute inset-0 grid place-items-center">
            <div className="w-3/5 aspect-square border-2 border-paper/80 rounded-2xl" />
          </div>
        )}
        {cameraState === 'unavailable' && (
          <div className="absolute inset-0 grid place-items-center text-paper/70 px-8 text-center">
            Camera scanning isn't available on this device. Type the container number below.
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
