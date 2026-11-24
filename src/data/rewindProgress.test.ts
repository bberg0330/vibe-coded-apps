import { describe, it, expect, vi } from 'vitest'
import { rewindProgress } from './rewindProgress'
import { watchCount } from './history'

vi.mock('./history', () => ({ watchCount: vi.fn() }))

describe('rewindProgress', () => {
  it('counts watched films in the list and ones that dropped out, never past the list size', () => {
    vi.mocked(watchCount).mockImplementation((id) => ([1, 2, 8, 9].includes(id) ? 1 : 0))
    expect(rewindProgress([1, 2, 3])).toBe(2)
    expect(rewindProgress([1, 3], [9])).toBe(2)
    expect(rewindProgress([1, 2], [8, 9])).toBe(2) // capped
    expect(rewindProgress([1, 2, 3], [1])).toBe(2) // no double count
  })
})
