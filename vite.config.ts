/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { storeApi } from './vite-plugins/store-api'
import { scoresApi } from './vite-plugins/scores-api'

export default defineConfig({
  plugins: [react(), storeApi(), scoresApi()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
