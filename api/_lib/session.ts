// Household passcode sessions. Replaces the shared write secret that used to
// ship in the client bundle (VITE_STORE_API_SECRET): the passcode is checked
// here, and the browser gets a signed, expiring token to send as
// `Authorization: Bearer <token>`. A header rather than a cookie so it also
// works when the app calls the API from another origin (the iOS build points
// at the production URL).
//
// Server-only env: HOUSEHOLD_PASSCODE (what people type) and SESSION_SECRET
// (signs tokens; rotating it signs everyone out).
import { createHmac, createHash, timingSafeEqual } from 'node:crypto'

/** How long one unlock lasts on a device. */
export const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000

export type SessionConfig = { passcode?: string; secret?: string }

export type SessionCheck =
  | { ok: true }
  | { ok: false; status: 401 | 503; body: { error: string } }

const b64url = (buf: Buffer) => buf.toString('base64url')

function sign(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest())
}

/** Constant-time string comparison that doesn't leak length. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export function issueToken(secret: string, now = Date.now()): string {
  const payload = b64url(Buffer.from(JSON.stringify({ exp: now + SESSION_TTL_MS })))
  return `${payload}.${sign(payload, secret)}`
}

export function verifyToken(token: string, secret: string, now = Date.now()): boolean {
  const [payload, sig] = token.split('.')
  if (!payload || !sig || !safeEqual(sig, sign(payload, secret))) return false
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: unknown }
    return typeof exp === 'number' && exp > now
  } catch {
    return false
  }
}

export function checkPasscode(input: unknown, passcode: string): boolean {
  return typeof input === 'string' && safeEqual(input.trim(), passcode)
}

function bearer(authorization: string | string[] | undefined): string | null {
  const value = Array.isArray(authorization) ? authorization[0] : authorization
  const match = value?.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

const misconfigured = { ok: false, status: 503, body: { error: 'session_not_configured' } } as const

/**
 * Gate for every API route. Fails closed: with no SESSION_SECRET configured,
 * nothing is served rather than everything.
 */
export function requireSession(
  headers: Record<string, string | string[] | undefined>,
  config: SessionConfig,
  now = Date.now(),
): SessionCheck {
  if (!config.secret) return misconfigured
  const token = bearer(headers.authorization)
  if (!token || !verifyToken(token, config.secret, now)) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } }
  }
  return { ok: true }
}

export const sessionConfig = (): SessionConfig => ({
  passcode: process.env.HOUSEHOLD_PASSCODE,
  secret: process.env.SESSION_SECRET,
})

/** Slows passcode guessing; applied to every wrong attempt. */
export const WRONG_PASSCODE_DELAY_MS = 750

/**
 * `POST /api/session { passcode }` → `{ token }` or 401.
 * `GET /api/session` with a bearer token → 200 if still valid, else 401.
 */
export async function handleSession(
  method: string | undefined,
  headers: Record<string, string | string[] | undefined>,
  body: unknown,
  config: SessionConfig,
  now = Date.now(),
  delay: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ status: number; body: unknown }> {
  if (!config.passcode || !config.secret) return misconfigured
  if (method === 'GET') {
    const check = requireSession(headers, config, now)
    return check.ok ? { status: 200, body: { ok: true } } : check
  }
  if (method === 'POST') {
    const passcode = (body as { passcode?: unknown } | null)?.passcode
    if (!checkPasscode(passcode, config.passcode)) {
      await delay(WRONG_PASSCODE_DELAY_MS)
      return { status: 401, body: { error: 'wrong_passcode' } }
    }
    return { status: 200, body: { token: issueToken(config.secret, now) } }
  }
  return { status: 405, body: { error: 'Method not allowed' } }
}
