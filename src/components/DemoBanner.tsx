import { isDemoHost } from '../lib/env'

/** Persistent strip on the demonstration site (Architecture 20.2, rule 8).
 * Okabe-Ito orange with ink text: colour, icon and words, never colour alone.
 * Renders nothing on production because isDemoHost is false there. */
export function DemoBanner() {
  if (!isDemoHost) return null
  return (
    <div role="status" className="text-center text-xs font-semibold tracking-wide px-3 py-1.5"
         style={{ background: '#E69F00', color: '#1D1D1B' }}>
      <span aria-hidden="true">&#9679;</span> DEMO ENVIRONMENT. Practice data only. Nothing here is a customer record.
    </div>
  )
}
