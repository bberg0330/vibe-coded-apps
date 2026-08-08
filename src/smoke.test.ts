import { describe, it, expect } from 'vitest'

describe('test harness', () => {
  it('runs and has a DOM', () => {
    expect(typeof document).toBe('object')
  })

  it('has a working localStorage', () => {
    localStorage.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
  })
})
