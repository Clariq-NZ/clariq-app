import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** One Supabase client for the whole app: the gateway and the auth layer must
 * share a session, so neither creates its own. Null when no backend is
 * configured (demo mode). */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null

export const hasBackend = supabase !== null
