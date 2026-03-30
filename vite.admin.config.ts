import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 어드민 SPA 빌드 전용 설정
export default defineConfig({
  plugins: [react()],
  root: 'src/admin',
  base: '/admin/',
  css: {
    postcss: {
      plugins: [],
    },
  },
  build: {
    outDir: '../../public/admin',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'recharts-vendor': ['recharts'],
          'lucide-vendor': ['lucide-react'],
        },
      },
    },
  },
})
