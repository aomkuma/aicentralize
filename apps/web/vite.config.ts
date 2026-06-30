import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const devPort = Number(process.env.PORT || process.env.VITE_PORT || 5175)

function normalizePublicUrl(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return ''
  }

  return trimmed.replace(/\/+$/, '')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..', '..'), '')
  const appPublicUrl = normalizePublicUrl(env.VITE_APP_PUBLIC_URL || env.APP_PUBLIC_URL || env.WEB_PUBLIC_URL)

  return {
  plugins: [
    react(),
    {
      name: 'inject-app-public-url',
      transformIndexHtml(html) {
        if (!appPublicUrl) {
          return html.replaceAll('__APP_PUBLIC_URL__', '')
        }

        return html.replaceAll('__APP_PUBLIC_URL__', appPublicUrl)
      },
    },
  ],
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
  }
})
