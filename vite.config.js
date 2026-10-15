import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('commonjsHelpers') || id.includes('vite/preload-helper')) return 'vendor-helpers'
          if (!id.includes('node_modules')) return
          if (/\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          if (id.includes('/@firebase/') || id.includes('/firebase/')) return 'firebase'
          if (id.includes('/html2canvas/')) return 'html2canvas'
          if (id.includes('/jspdf/') || id.includes('/jspdf-autotable/')) return 'pdf'
        }
      }
    }
  }
})
