/**
 * User-facing error messages.
 *
 * Browsers surface a lost network as a bare TypeError ("Failed to fetch",
 * "Load failed" on Safari, "NetworkError" on Firefox). supabase-js passes that
 * text through unchanged. None of it should ever reach a person in a shed on a
 * flaky connection, so every error that is shown on screen goes through here.
 */
const NETWORK_MARKERS = ['failed to fetch', 'load failed', 'networkerror', 'network request failed', 'fetch failed']

export const OFFLINE_MESSAGE = "Can't reach Clariq. Check your connection and try again."

export function isNetworkError(err: unknown): boolean {
  const msg = messageOf(err).toLowerCase()
  if (NETWORK_MARKERS.some(m => msg.includes(m))) return true
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isNetworkError(err)) return OFFLINE_MESSAGE
  const msg = messageOf(err).trim()
  return msg || fallback
}

function messageOf(err: unknown): string {
  if (!err) return ''
  if (typeof err === 'string') return err
  if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return String(err)
}
