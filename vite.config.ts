import build from '@hono/vite-build/cloudflare-workers'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'

// Hono Worker 빌드 (Cloudflare Workers 방식)
export default defineConfig({
  plugins: [
    build({
      entry: 'src/index.ts',
      outputDir: 'dist',
    }),
    devServer({ adapter, entry: 'src/index.ts' }),
  ],
})
