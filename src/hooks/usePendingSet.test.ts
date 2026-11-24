import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePendingSet } from './usePendingSet'

describe('usePendingSet', () => {
  it('drops a second start for the same key in the same tick, until it finishes', () => {
    const { result } = renderHook(() => usePendingSet<number>())
    let first = false, second = true
    act(() => { first = result.current.start(1); second = result.current.start(1) })
    expect([first, second]).toEqual([true, false])
    expect(result.current.pending.has(1)).toBe(true)
    act(() => result.current.finish(1))
    expect(result.current.pending.has(1)).toBe(false)
    act(() => { first = result.current.start(1) })
    expect(first).toBe(true)
  })
})
