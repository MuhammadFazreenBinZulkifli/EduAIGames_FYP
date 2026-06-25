import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_DEV_API_URL || 'http://localhost:5000'

  return {
    appType: 'spa',
    plugins: [react()],
    server: {
      proxy: {
        '/api': apiProxyTarget,
      },
    },
    preview: {
      proxy: {
        '/api': apiProxyTarget,
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
    },
  }
})
