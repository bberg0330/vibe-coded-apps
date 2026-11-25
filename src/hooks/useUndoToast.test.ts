import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUndoToast, UNDO_MS } from './useUndoToast'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useUndoToast', () => {
  it('commits after the timeout, or runs the action on request', () => {
    const { result } = renderHook(() => useUndoToast())
    const a = { message: 'a', action: vi.fn(), commit: vi.fn() }
    act(() => result.current.showUndo(a))
    act(() => { vi.advanceTimersByTime(UNDO_MS) })
    expect(a.commit).toHaveBeenCalled()
    expect(result.current.toast).toBeNull()

    const b = { message: 'b', action: vi.fn(), commit: vi.fn() }
    act(() => result.current.showUndo(b))
    act(() => result.current.settleToast('action'))
    expect(b.action).toHaveBeenCalled()
    expect(b.commit).not.toHaveBeenCalled()
  })

  it('commits the previous action when a new one is shown, and on pagehide', () => {
    const { result } = renderHook(() => useUndoToast())
    const a = { message: 'a', action: vi.fn(), commit: vi.fn() }
    const b = { message: 'b', action: vi.fn(), commit: vi.fn() }
    act(() => result.current.showUndo(a))
    act(() => result.current.showUndo(b))
    expect(a.commit).toHaveBeenCalled()
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(b.commit).toHaveBeenCalled()
  })

  it('stops the clock while held and restarts it in full on release', () => {
    const { result } = renderHook(() => useUndoToast())
    const a = { message: 'a', action: vi.fn(), commit: vi.fn() }
    act(() => result.current.showUndo(a))
    act(() => result.current.holdToast(true))
    act(() => { vi.advanceTimersByTime(UNDO_MS * 3) })
    expect(a.commit).not.toHaveBeenCalled()
    act(() => result.current.holdToast(false))
    act(() => { vi.advanceTimersByTime(UNDO_MS - 1) })
    expect(a.commit).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(a.commit).toHaveBeenCalled()
  })
})
