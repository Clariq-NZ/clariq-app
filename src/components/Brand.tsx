import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Brand surfaces - Architecture section 14.
 * The wordmark is supplied artwork and is never set in type. Every screen
 * carries the Off Black bar with the Stone White reverse lock-up (brand guide
 * approved pairing for dark fields). Assets in /public/brand are recoloured
 * from the supplied master; geometry untouched. */

export function Lockup({ className = 'h-6' }: { className?: string }) {
  return <img src="/brand/lockup-stone-white.png" alt="Clariq" className={className} draggable={false} />
}

/** Dark header bar. Left slot for a back link, right slot for actions. */
export function BrandBar({ back, right, subtitle }:
  { back?: string; right?: ReactNode; subtitle?: string }) {
  return (
    <header className="bg-bar text-bar-ink -mx-5 px-5 pt-safe">
      <div className="h-14 flex items-center justify-between max-w-md mx-auto">
        <div className="w-16 flex items-center">
          {back && <Link to={back} className="text-bar-ink/80 text-sm underline min-h-[44px] flex items-center">&#8249; Back</Link>}
        </div>
        <Link to="/" aria-label="Clariq home" className="flex items-center"><Lockup /></Link>
        <div className="w-16 flex items-center justify-end text-sm">{right}</div>
      </div>
      {subtitle && (
        <div className="text-center pb-3 text-xs tracking-[0.22em] text-bar-ink/70">{subtitle}</div>
      )}
    </header>
  )
}

/** Build identity, bottom of every screen (Architecture 14.2). */
export function AppFooter() {
  return (
    <footer className="mt-10 pt-3 border-t border-line flex justify-between text-xs text-ink-faint">
      <span>Clariq</span>
      <span>v{__APP_VERSION__} &middot; {__APP_COMMIT__}</span>
    </footer>
  )
}

/** Applies the tenant's region motif to <html> (Architecture 14.1). */
export function applyMotif(motif: string | null | undefined) {
  const m = motif && ['NZ_FERN', 'AU_GUM'].includes(motif) ? motif : 'NONE'
  document.documentElement.dataset.motif = m
}
