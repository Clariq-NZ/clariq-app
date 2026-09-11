// Keep-awake ping (Architecture 20.5). Supabase Free-plan projects pause after
// seven days without API traffic. This scheduled function makes one authenticated
// REST request a day to whichever Supabase project this site is built against,
// so the demo project never pauses. It runs on the production site too, where it
// is harmless. Netlify picks up the schedule from the exported config.
export default async () => {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return new Response('no backend configured', { status: 200 })
  const res = await fetch(`${url}/rest/v1/roles?select=code&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return new Response(`ping ${res.status}`, { status: 200 })
}

export const config = { schedule: '0 18 * * *' } // 18:00 UTC, early morning NZ
