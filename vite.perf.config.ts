import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist-perf',
    emptyOutDir: true,
    rollupOptions: { input: 'perf.html' },
  },
})
