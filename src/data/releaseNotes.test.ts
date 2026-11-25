import { describe, it, expect } from 'vitest'
import { RELEASE_NOTES, latestRelease, formatReleaseDate, getSeenRelease, markReleaseSeen } from './releaseNotes'

describe('release notes', () => {
  it('has a newest entry with at most four rows, each with a title and a body', () => {
    const latest = latestRelease()!
    expect(latest).toBe(RELEASE_NOTES[0])
    expect(latest.rows.length).toBeGreaterThan(0)
    expect(latest.rows.length).toBeLessThanOrEqual(4)
    for (const row of latest.rows) {
      expect(row.title).not.toBe('')
      expect(row.body).not.toBe('')
      expect(Boolean(row.icon) !== Boolean(row.glyph)).toBe(true) // exactly one of icon or glyph
    }
  })

  it('has unique ids and no entries when given none', () => {
    expect(new Set(RELEASE_NOTES.map((r) => r.id)).size).toBe(RELEASE_NOTES.length)
    expect(latestRelease([])).toBeNull()
  })

  it('formats an ISO date as day and month, and leaves anything else alone', () => {
    expect(formatReleaseDate('2026-11-25')).toBe('25 Nov')
    expect(formatReleaseDate('2026-01-05')).toBe('5 Jan')
    expect(formatReleaseDate('last Tuesday')).toBe('last Tuesday')
  })

  it('remembers the seen release per profile', () => {
    expect(getSeenRelease('a')).toBeNull()
    markReleaseSeen('a', '2026-11-25')
    expect(getSeenRelease('a')).toBe('2026-11-25')
    expect(getSeenRelease('b')).toBeNull()
  })

  it('does not throw when storage is blocked', () => {
    const original = Storage.prototype.getItem
    const originalSet = Storage.prototype.setItem
    Storage.prototype.getItem = () => { throw new Error('blocked') }
    Storage.prototype.setItem = () => { throw new Error('blocked') }
    try {
      expect(getSeenRelease('a')).toBeNull()
      expect(() => markReleaseSeen('a', 'x')).not.toThrow()
    } finally {
      Storage.prototype.getItem = original
      Storage.prototype.setItem = originalSet
    }
  })
})
