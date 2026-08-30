import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { BrandBar, AppFooter } from '../components/Brand'
import { PageHead } from '../components/ui'
import { GUIDE } from '../lib/guide'
import { useAuth, isCustomerView } from '../lib/auth'

export default function GuidePage() {
  const { user } = useAuth()
  const cv = isCustomerView(user)
  const sections = GUIDE.filter(s => !s.staff || !cv)
  const { hash } = useLocation()
  // The help mark on a screen opens its own section, not the top of the guide.
  useEffect(() => {
    const id = hash.replace('#', '')
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [hash])
  return (
    <main className="min-h-dvh px-5 pb-10 max-w-md mx-auto">
      <BrandBar back="/menu" />
      <PageHead title="Show me how" purpose="Each task in the order you would do it. Tap a heading to jump." />
      <nav className="mb-8 flex flex-wrap gap-2 text-sm">
        {sections.map(s => <a key={s.id} href={`#${s.id}`} className="rounded border border-line bg-surface px-3 py-1.5">{s.title}</a>)}
      </nav>
      {sections.map(s => (
        <section key={s.id} id={s.id} className="mb-8 scroll-mt-4">
          <h2 className="font-display text-lg font-semibold mb-2">{s.title}</h2>
          <ol className="list-decimal pl-5 space-y-1.5 text-ink">{s.steps.map((t, j) => <li key={j}>{t}</li>)}</ol>
        </section>
      ))}
      <AppFooter />
    </main>
  )
}
