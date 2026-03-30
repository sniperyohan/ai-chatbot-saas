import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'

// Hono Worker 빌드
export default defineConfig({
  plugins: [
    build({ entry: 'src/index.ts' }),
    devServer({ adapter, entry: 'src/index.ts' }),
  ],
})
