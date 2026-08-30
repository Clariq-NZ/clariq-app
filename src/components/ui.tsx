import type { ContainerStatus } from '../lib/status'
import { STATUS_META, statusLabel } from '../lib/status'

/** Every status signal is colour + icon + text - never colour alone
 * (Architecture 14; the Admin is colour-blind). */

const GROUP_BG: Record<string, string> = {
  ready: 'bg-status-ready', out: 'bg-status-out', processing: 'bg-status-processing',
  problem: 'bg-status-problem', eol: 'bg-status-eol', neutral: 'bg-status-neutral',
}

const ICONS: Record<string, JSX.Element> = {
  'check-circle': <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
  'truck': <path d="M1 8h12v8H1zM13 11h4l3 3v2h-7zM6 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm11 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />,
  'refresh': <path d="M4 4v6h6M20 20v-6h-6M5 14a7.5 7.5 0 0013.4 3M19 10A7.5 7.5 0 005.6 7" />,
  'shield-alert': <path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6l8-3zm0 5v4m0 3h.01" />,
  'archive': <path d="M3 5h18v4H3zM5 9v10h14V9M10 13h4" />,
  'plus-circle': <path d="M12 8v8m-4-4h8m9 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
}

export function StatusChip({ status, size = 'md', customerView = false }:
  { status: ContainerStatus; size?: 'md' | 'lg'; customerView?: boolean }) {
  const meta = STATUS_META[status]
  const dims = size === 'lg' ? 'text-base px-4 py-2 gap-2.5' : 'text-sm px-3 py-1.5 gap-2'
  return (
    <span className={`inline-flex items-center rounded-full text-white font-medium ${dims} ${GROUP_BG[meta.group]}`}>
      <svg viewBox="0 0 24 24" className={size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'}
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ICONS[meta.icon]}
      </svg>
      {statusLabel(status, customerView)}
    </span>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink-soft mb-1.5">{label}</span>
      {children}
    </label>
  )
}

export const inputCls =
  'w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-lg ' +
  'focus:border-ink-soft focus:outline-none min-h-[52px]'

export function Toggle({ label, value, onChange }:
  { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  const btn = (v: boolean, text: string) => (
    <button type="button" onClick={() => onChange(v)}
      className={`flex-1 min-h-[52px] rounded-xl border text-lg font-medium
        ${value === v ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink-soft'}`}>
      {text}
    </button>
  )
  return (
    <div>
      <span className="block text-sm font-medium text-ink-soft mb-1.5">{label}</span>
      <div className="flex gap-2">{btn(true, 'Yes')}{btn(false, 'No')}</div>
    </div>
  )
}

export function PrimaryButton({ children, disabled, onClick }:
  { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <button type="submit" disabled={disabled} onClick={onClick}
      className="w-full min-h-[56px] rounded-xl bg-ink text-paper text-lg font-semibold
                 disabled:opacity-40 focus-visible:outline focus-visible:outline-2">
      {children}
    </button>
  )
}
