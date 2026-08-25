import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { inputCls, PrimaryButton } from '../components/ui'

/** Staff scan screen. Camera path uses BarcodeDetector where available;
 * the manual-entry path is always present and equally first-class, because
 * damaged QRs are a designed-for case (the human-readable ID exists for
 * exactly this - brief section 4). */

const CODE_RE = /CLQ-\d{6}/

export default function ScanPage() {
  const nav = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraState, setCameraState] = useState<'starting' | 'live' | 'unavailable'>('starting')
  const [manual, setManual] = useState('')

  useEffect(() => {
    let stream: MediaStream | undefined
    let stop = false
    async function run() {
      const Detector = (window as any).BarcodeDetector
      if (!Detector || !navigator.mediaDevices?.getUserMedia) { setCameraState('unavailable'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraState('live')
        const detector = new Detector({ formats: ['qr_code'] })
        const tick = async () => {
          if (stop || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            for (const c of codes) {
              const m = String(c.rawValue).toUpperCase().match(CODE_RE)
              if (m) { nav(`/c/${m[0]}`); return }
            }
          } catch { /* frame not ready; keep looping */ }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      } catch {
        setCameraState('unavailable')
      }
    }
    run()
    return () => { stop = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [nav])

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault()
    const digits = manual.replace(/\D/g, '').padStart(6, '0')
    if (digits.length === 6) nav(`/c/CLQ-${digits}`)
  }

  return (
    <main className="min-h-dvh flex flex-col px-5 pb-6 pt-safe">
      <header className="py-4 text-center">
        <div className="font-display font-semibold tracking-brand">CLARIQ</div>
      </header>

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
    </main>
  )
}
