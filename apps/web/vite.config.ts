import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    hmr: {
      host: 'localhost',
      port: 5175,
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
