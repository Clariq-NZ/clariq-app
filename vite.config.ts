import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const commit = (process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? 'local').slice(0, 7)
// Build number: commits on the branch when Git history is available (Netlify,
// GitHub), otherwise today's date. Shown as v<major>.<minor>.<build>; the commit
// hash is kept in a tooltip for support.
let build = new Date().toISOString().slice(2, 10).replace(/-/g, '')
try { build = execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || build } catch { /* no git */ }
const [major, minor] = String(pkg.version).split('.')
const version = `${major}.${minor}.${build}`

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Clariq Containers',
        short_name: 'Clariq',
        description: 'Circular container tracking',
        theme_color: '#1D1D1B',
        background_color: '#FAF9F6',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
