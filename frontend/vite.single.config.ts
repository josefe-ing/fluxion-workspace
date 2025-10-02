import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile()
  ],
  build: {
    outDir: 'demo',
    assetsDir: '',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      }
    }
  }
})