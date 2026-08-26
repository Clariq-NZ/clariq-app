import { useParams } from 'react-router-dom'
import { BrandBar, AppFooter } from '../components/Brand'

/**
 * Public container page - Architecture section 7.
 * Unauthenticated visitors see identity + return instructions only.
 * No product, batch or customer information leaks here, ever.
 *
 * Data: in Stage 2 deployment this is served by an edge function that returns
 * only { code, exists, return_instructions }. Until Supabase is linked, the
 * page renders from the route param alone, which is honest: the public page
 * shows nothing that needs a database.
 */
export default function PublicScanPage() {
  const { code } = useParams()
  const id = (code ?? '').toUpperCase()
  const valid = /^CLQ-\d{6}$/.test(id)

  return (
    <main className="min-h-dvh flex flex-col px-5 pb-6">
      <BrandBar subtitle="RETURN &bull; REUSE &bull; RECOVER" />
      <div className="flex-1 flex flex-col items-center justify-center py-10">

      {/* Signature element: the container plate. Hexagonal frame echoes the
          Clariq mark; the ID is the hero because on this page identity IS the
          content. */}
      <section aria-label="Container identity" className="relative mb-10">
        <svg width="260" height="150" viewBox="0 0 260 150" role="img" aria-label={`Container ${id}`}>
          <polygon
            points="46,4 214,4 256,75 214,146 46,146 4,75"
            fill="none" stroke="currentColor" strokeWidth="2.5"
          />
          <text x="130" y="70" textAnchor="middle"
            className="font-display" fontSize="13" letterSpacing="3" fill="currentColor" opacity="0.55">
            CONTAINER
          </text>
          <text x="130" y="98" textAnchor="middle"
            className="font-display" fontSize="24" fontWeight="700" letterSpacing="2" fill="currentColor">
            {valid ? id : 'CLQ-______'}
          </text>
        </svg>
      </section>

      <section className="max-w-sm text-center space-y-4">
        <h1 className="font-display text-lg font-semibold">
          This container belongs to Clariq
        </h1>
        <p className="text-ink-soft leading-relaxed">
          Please return it so it can be washed, inspected and used again.
          {/* return_instructions from tenant settings replaces this line at deploy */}
        </p>
        <p className="text-ink-soft leading-relaxed">
          Questions? Email <a href="mailto:info@clariq.nz" className="underline text-ink">info@clariq.nz</a> and quote the container number above.
        </p>
      </section>

      <footer className="mt-12">
        <a
          href="/login"
          className="inline-block rounded-lg border border-line px-6 py-3 text-sm text-ink-soft
                     hover:border-ink-soft focus-visible:outline focus-visible:outline-2"
        >
          Sign in
        </a>
      </footer>
      </div>
      <AppFooter />
    </main>
  )
}
