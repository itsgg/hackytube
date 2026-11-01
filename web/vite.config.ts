import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// HACKYTUBE_PUBLIC lets the end-to-end tests serve a small fixture catalog instead of the real data.
export default defineConfig({
  plugins: [react()],
  publicDir: process.env.HACKYTUBE_PUBLIC ?? 'public',
  server: { port: Number(process.env.PORT ?? 5180), strictPort: true, host: '127.0.0.1', allowedHosts: ['.ts.net'] },
  preview: { port: 5180, strictPort: true, host: '127.0.0.1', allowedHosts: ['.ts.net'] },
})
