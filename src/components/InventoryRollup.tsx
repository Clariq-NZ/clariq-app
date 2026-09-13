import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildRollup, splitText, totals, round, type Grouping, type RollupNode, type RollupRow } from '../lib/rollup'

/** The register, rolled up (decision 2026-09-13).
 *
 *  Chemical, then site, then container size, then the containers. Each level
 *  expands in place rather than navigating away, so nobody loses their place
 *  on a phone, and the container row opens the container card.
 *
 *  The supplier's containers and the customer's own stock are separate blocks
 *  with separate subtotals. Empties sit on their own line: they are on site
 *  and they need collecting, but they are not volume. */

function Chevron({ open }: { open: boolean }) {
  return <span aria-hidden className={`text-accent text-lg transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
}

function Amount({ n }: { n: RollupNode }) {
  return (
    <span className="text-right shrink-0 tabular-nums">
      <span className="font-semibold">{round(n.litres)} L</span>
      <span className="block text-xs text-ink-faint">
        {n.containers} container{n.containers === 1 ? '' : 's'}
        {n.empties > 0 && ` · ${n.empties} empty`}
      </span>
    </span>
  )
}

function Row({ node, level, open, onToggle }: { node: RollupNode; level: number; open: boolean; onToggle: () => void }) {
  const split = splitText(node.split)
  const pad = ['pl-4', 'pl-8', 'pl-12'][level] ?? 'pl-4'
  const weight = level === 0 ? 'font-display font-semibold' : level === 1 ? 'font-medium' : 'text-sm text-ink-soft'
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      className={`w-full flex items-center gap-2 py-3 pr-4 ${pad} min-h-[56px] text-left border-b border-line`}>
      <Chevron open={open} />
      <span className={`flex-1 ${weight}`}>
        {node.label}
        {split && <span className="block text-xs font-normal text-ink-faint">{split}</span>}
      </span>
      <Amount n={node} />
    </button>
  )
}

function Branch({ node, level, expanded, toggle }: {
  node: RollupNode; level: number; expanded: Set<string>; toggle: (k: string) => void
}) {
  const open = expanded.has(node.key)
  return (
    <li>
      <Row node={node} level={level} open={open} onToggle={() => toggle(node.key)} />
      {open && node.children && (
        <ul>{node.children.map(c => <Branch key={c.key} node={c} level={level + 1} expanded={expanded} toggle={toggle} />)}</ul>
      )}
      {open && node.rows && (
        <ul className="bg-surface">
          {node.rows.map(r => (
            <li key={r.containerCode}>
              <Link to={`/c/${r.containerCode}`}
                className="flex items-center justify-between gap-2 py-3 pl-16 pr-4 min-h-[56px] border-b border-line">
                <span>
                  <span className="font-display font-semibold text-accent">{r.containerCode}</span>
                  <span className="block text-xs text-ink-faint">
                    {r.empty ? 'empty, awaiting collection' : r.basis}
                    {r.where ? ` · ${r.where}` : ''}
                    {r.since ? ` · on site since ${r.since}` : ''}
                  </span>
                </span>
                <span className="tabular-nums shrink-0">{r.empty ? '0 L' : `${round(r.quantity ?? 0)} L`}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function Block({ title, note, nodes, expanded, toggle }: {
  title: string; note?: string; nodes: RollupNode[]; expanded: Set<string>; toggle: (k: string) => void
}) {
  if (!nodes.length) return null
  const t = totals(nodes)
  return (
    <section className="mb-5 rounded-xl border border-line overflow-hidden">
      <header className="px-4 py-3 bg-surface border-b border-line">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{title}</h2>
          <span className="tabular-nums font-semibold">{round(t.litres)} L</span>
        </div>
        <p className="text-xs text-ink-faint mt-1">
          {t.containers} container{t.containers === 1 ? '' : 's'} holding product
          {t.empties > 0 && `, ${t.empties} empty awaiting collection`}
          {splitText(t.split) && ` · ${splitText(t.split)}`}
        </p>
        {note && <p className="text-xs text-ink-faint mt-1">{note}</p>}
      </header>
      <ul>{nodes.map(n => <Branch key={n.key} node={n} level={0} expanded={expanded} toggle={toggle} />)}</ul>
    </section>
  )
}

export function InventoryRollup({ rows, group, onGroupChange }: {
  rows: RollupRow[]; group: Grouping; onGroupChange: (g: Grouping) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(k) ? next.delete(k) : next.add(k)
    return next
  })

  const supplier = useMemo(() => buildRollup(rows.filter(r => r.supplier), group), [rows, group])
  const own = useMemo(() => buildRollup(rows.filter(r => !r.supplier), group), [rows, group])

  const expandAll = () => {
    const keys = new Set<string>()
    const walk = (n: RollupNode) => { keys.add(n.key); (n.children ?? []).forEach(walk) }
    supplier.forEach(walk); own.forEach(walk)
    setExpanded(keys)
  }

  if (!rows.length) return <p className="text-ink-soft py-6">Nothing recorded on site yet.</p>

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div role="group" aria-label="Group by" className="flex rounded-xl border border-line overflow-hidden">
          {(['product', 'site'] as Grouping[]).map(g => (
            <button key={g} type="button" onClick={() => onGroupChange(g)} aria-pressed={group === g}
              className={`px-4 min-h-[44px] text-sm ${group === g ? 'bg-accent text-accent-ink font-semibold' : 'bg-surface text-ink-soft'}`}>
              {g === 'product' ? 'By chemical' : 'By site'}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => expanded.size ? setExpanded(new Set()) : expandAll()}
          className="text-sm underline text-ink-soft min-h-[44px]">
          {expanded.size ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <Block title={group === 'product' ? 'By chemical' : 'By site'} nodes={supplier} expanded={expanded} toggle={toggle} />
      <Block title="Your own containers" nodes={own} expanded={expanded} toggle={toggle}
        note="Recorded on an audit walk. Not supplied in a tracked container, so these are outside the supplier figures above." />
    </>
  )
}
