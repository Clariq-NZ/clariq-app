import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** New-version bar (12 Sep). The service worker checks for a new build on
 * load and every 30 minutes; when one is waiting, a bar offers "Update".
 * One tap swaps the worker and reloads. Nobody has to know what a service
 * worker is. */
export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, r) {
      if (!r) return
      setInterval(() => { void r.update() }, 30 * 60 * 1000)
    },
  })
  useEffect(() => { /* nothing to do until needRefresh flips */ }, [needRefresh])
  if (!needRefresh) return null
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="mx-auto max-w-md pointer-events-auto rounded-2xl bg-ink text-paper shadow-card px-5 py-4 flex items-center justify-between gap-4">
        <span className="text-sm">A new version of Clariq is ready.</span>
        <div className="flex gap-3 shrink-0">
          <button type="button" onClick={() => setNeedRefresh(false)} className="text-sm underline text-paper/80">Later</button>
          <button type="button" onClick={() => void updateServiceWorker(true)} className="rounded-lg bg-accent text-accent-ink font-semibold px-4 py-2 text-sm">Update</button>
        </div>
      </div>
    </div>
  )
}
