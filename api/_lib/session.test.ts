import { describe, it, expect, vi } from 'vitest'
import {
  issueToken, verifyToken, checkPasscode, requireSession, handleSession,
  SESSION_TTL_MS, WRONG_PASSCODE_DELAY_MS,
} from './session'

const CONFIG = { passcode: 'popcorn', secret: 'signing-secret' }
const NOW = Date.UTC(2026, 8, 30)
const noDelay = vi.fn(async () => {})

describe('tokens', () => {
  it('verifies a token it issued, until it expires', () => {
    const token = issueToken(CONFIG.secret, NOW)
    expect(verifyToken(token, CONFIG.secret, NOW + 1000)).toBe(true)
    expect(verifyToken(token, CONFIG.secret, NOW + SESSION_TTL_MS + 1)).toBe(false)
  })

  it('rejects a token signed with another secret, or tampered with', () => {
    const token = issueToken('other-secret', NOW)
    expect(verifyToken(token, CONFIG.secret, NOW)).toBe(false)

    const [payload, sig] = issueToken(CONFIG.secret, NOW).split('.')
    const longer = Buffer.from(JSON.stringify({ exp: NOW + 10 * SESSION_TTL_MS })).toString('base64url')
    expect(verifyToken(`${longer}.${sig}`, CONFIG.secret, NOW)).toBe(false)
    expect(verifyToken(payload, CONFIG.secret, NOW)).toBe(false)
    expect(verifyToken('garbage', CONFIG.secret, NOW)).toBe(false)
  })
})

describe('checkPasscode', () => {
  it('matches exactly, ignoring surrounding spaces', () => {
    expect(checkPasscode(' popcorn ', 'popcorn')).toBe(true)
    expect(checkPasscode('Popcorn', 'popcorn')).toBe(false)
    expect(checkPasscode(undefined, 'popcorn')).toBe(false)
  })
})

describe('requireSession', () => {
  it('accepts a valid bearer token', () => {
    const token = issueToken(CONFIG.secret, NOW)
    expect(requireSession({ authorization: `Bearer ${token}` }, CONFIG, NOW)).toEqual({ ok: true })
  })

  it('answers 401 without one', () => {
    expect(requireSession({}, CONFIG, NOW)).toMatchObject({ ok: false, status: 401 })
  })

  it('fails closed with 503 when no signing secret is configured', () => {
    const token = issueToken(CONFIG.secret, NOW)
    expect(requireSession({ authorization: `Bearer ${token}` }, {}, NOW)).toMatchObject({ ok: false, status: 503 })
  })
})

describe('handleSession', () => {
  it('issues a working token for the right passcode', async () => {
    const result = await handleSession('POST', {}, { passcode: 'popcorn' }, CONFIG, NOW, noDelay)
    expect(result.status).toBe(200)
    const { token } = result.body as { token: string }
    expect(verifyToken(token, CONFIG.secret, NOW)).toBe(true)
  })

  it('refuses a wrong passcode, after a delay', async () => {
    const delay = vi.fn(async () => {})
    const result = await handleSession('POST', {}, { passcode: 'nachos' }, CONFIG, NOW, delay)
    expect(result).toEqual({ status: 401, body: { error: 'wrong_passcode' } })
    expect(delay).toHaveBeenCalledWith(WRONG_PASSCODE_DELAY_MS)
  })

  it('reports whether an existing token is still valid', async () => {
    const token = issueToken(CONFIG.secret, NOW)
    expect((await handleSession('GET', { authorization: `Bearer ${token}` }, null, CONFIG, NOW)).status).toBe(200)
    expect((await handleSession('GET', {}, null, CONFIG, NOW)).status).toBe(401)
  })

  it('answers 503 when the passcode or secret is not configured', async () => {
    expect((await handleSession('POST', {}, { passcode: 'x' }, { secret: 's' }, NOW, noDelay)).status).toBe(503)
    expect((await handleSession('POST', {}, { passcode: 'x' }, { passcode: 'x' }, NOW, noDelay)).status).toBe(503)
  })
})
