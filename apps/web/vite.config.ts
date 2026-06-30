import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const devPort = Number(process.env.PORT || process.env.VITE_PORT || 5175)

export default defineConfig({
  plugins: [react()],
  server: {
    port: devPort,
    // Source PNGs in kora-pack/ are ingest-only; watching them on Windows can EBUSY-crash Vite.
    watch: {
      ignored: ['**/public/brand/kora-pack/**'],
    },
    hmr: {
      host: 'localhost',
      protocol: 'ws'
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/ai': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    },
    headers: {
      'Service-Worker-Allowed': '/',
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
