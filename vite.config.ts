/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Relative imports reachable from this config carry explicit .ts extensions so
// Vite's `configLoader: 'native'` can load them — it is slated to become the
// default in a future major and cannot resolve extensionless specifiers.
import { storeApi } from './vite-plugins/store-api.ts'
import { scoresApi } from './vite-plugins/scores-api.ts'

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
