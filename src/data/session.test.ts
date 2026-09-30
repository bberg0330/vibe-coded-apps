import { describe, it, expect, vi, afterEach } from 'vitest'
import { apiUrl } from './session'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('apiUrl', () => {
  it('stays on the same origin in a browser, so previews call their own API', () => {
    expect(apiUrl('/api/session')).toBe('/api/session')
  })

  it('uses the production URL from a non-web shell such as the iOS build', () => {
    vi.stubGlobal('location', { protocol: 'capacitor:' })
    expect(apiUrl('/api/store')).toBe('https://lb-movie-night-app.vercel.app/api/store')
  })

  it('honours VITE_API_ENDPOINT (the full store URL) as the base', () => {
    vi.stubEnv('VITE_API_ENDPOINT', 'https://staging.example.com/api/store')
    expect(apiUrl('/api/session')).toBe('https://staging.example.com/api/session')
  })
})
