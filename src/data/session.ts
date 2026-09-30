// The household session on this device: a signed token from /api/session,
// kept in localStorage and sent as `Authorization: Bearer` on every API call.
// Replaces the write secret that used to ship in the bundle.

const TOKEN_KEY = 'mn.session'

/**
 * Where the app's own API lives. In a browser (production, previews, dev)
 * that's the same origin, so `/api/...`. Only a non-web shell such as the iOS
 * build (capacitor://, file://) needs the production URL. VITE_API_ENDPOINT,
 * the full store URL, overrides both.
 *
 * Previews used to call the production URL too, cross-origin, so the browser
 * blocked every request before it reached a server.
 */
export function apiUrl(path: string): string {
  const override = import.meta.env.VITE_API_ENDPOINT
  if (override) return override.replace(/\/api\/store$/, '') + path
  const onWeb = typeof location !== 'undefined' && /^https?:$/.test(location.protocol)
  return onWeb ? path : `https://lb-movie-night-app.vercel.app${path}`
}

const ENDPOINT = apiUrl('/api/session')

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* private mode etc.: the session just won't survive a reload */ }
}

const lockListeners = new Set<() => void>()

/** Called whenever the server says this device isn't unlocked (401). Returns an unsubscribe. */
export function onLocked(listener: () => void): () => void {
  lockListeners.add(listener)
  return () => { lockListeners.delete(listener) }
}

function lock(): void {
  writeToken(null)
  for (const l of lockListeners) l()
}

/**
 * `fetch` for the app's own API: adds the session token, and on a 401 clears
 * it and tells listeners so the passcode screen comes back.
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = readToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401) lock()
  return res
}

export type SessionState = 'unlocked' | 'locked'

/** Whether this device's token is still accepted. Network failures count as unlocked-if-we-have-a-token, so offline boots aren't blocked. */
export async function checkSession(): Promise<SessionState> {
  if (!readToken()) return 'locked'
  try {
    const res = await apiFetch(ENDPOINT)
    return res.ok ? 'unlocked' : 'locked'
  } catch {
    return 'unlocked'
  }
}

export type UnlockResult = 'unlocked' | 'wrong' | 'error'

export async function unlock(passcode: string): Promise<UnlockResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    })
    if (res.status === 401) return 'wrong'
    if (!res.ok) return 'error'
    const { token } = (await res.json()) as { token?: string }
    if (!token) return 'error'
    writeToken(token)
    return 'unlocked'
  } catch {
    return 'error'
  }
}
