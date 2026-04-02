import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'

// Hono Worker 빌드
export default defineConfig({
  plugins: [
    build({
      entry: 'src/index.ts',
      // 정적 파일은 Worker를 거치지 않고 Cloudflare Pages가 직접 서빙
      excludeRoutes: [
        '/admin/assets/*',
        '/static/*',
        '/widget.js',
        '/widget-test.html',
        '/favicon.ico',
        '/favicon.svg',
      ],
    }),
    devServer({ adapter, entry: 'src/index.ts' }),
  ],
})
