import { hasBackend } from './supabase'

/** Build and host facts the app branches on (Architecture section 20).
 *
 * inMemoryDemo: the in-memory gateway with the generated fleet. Only when no
 * backend is configured (a local checkout with no .env) or, during local
 * development, when ?demo=1 is present. Hosted builds always have a backend,
 * so ?demo=1 does nothing there: the sales demo is the real app on the
 * clariq-demo project, never the in-memory world.
 *
 * isDemoHost: the demonstration site. Decided from the hostname so the banner
 * can never ship to production by way of an environment variable. */
const params = new URLSearchParams(location.search)

export const inMemoryDemo: boolean = !hasBackend || (import.meta.env.DEV && params.has('demo'))

export const isDemoHost: boolean = /^(clariq-demo\.netlify\.app|demo\.clariq\.nz|localhost|127\.0\.0\.1)$/.test(location.hostname) && hasBackend
