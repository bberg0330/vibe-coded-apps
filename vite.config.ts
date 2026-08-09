/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { storeApi } from './vite-plugins/store-api'
import { scoresApi } from './vite-plugins/scores-api'

export default defineConfig({
  plugins: [react(), storeApi(), scoresApi()],
  server: {
    // Allows reaching the dev server via the Mac's mDNS hostname
    // (e.g. http://My-Mac.local:5173), which stays the same across DHCP
    // reassigning the LAN IP — unlike the plain IP-based Network URL Vite
    // prints. The leading dot matches any hostname ending in ".local".
    allowedHosts: ['.local'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
