import { supabase } from './supabase'

/** Usage signals for finding confusion (decision 2026-08-30): where help is
 * opened, and where people arrive and leave again within a few seconds.
 * Fire and forget; never blocks the UI; nothing personal beyond the path. */

export type TrackKind = 'help_open' | 'bounce' | 'first_run_seen' | 'guide_match' | 'door'

export function track(kind: TrackKind, path: string, meta: Record<string, unknown> = {}) {
  if (!supabase) return
  void supabase.from('ui_events').insert({ kind, path, meta }).then(() => undefined, () => undefined)
}
