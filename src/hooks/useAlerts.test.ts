import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAlerts } from './useAlerts'
import { getAlerts, clearAlerts } from '../api/alerts'

vi.mock('../api/alerts', () => ({ getAlerts: vi.fn(), clearAlerts: vi.fn() }))
const alert = (id: number) => ({ id, tmdbId: id, title: `Film ${id}`, posterPath: null, where: 'Stream · Netflix', createdAt: '' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAlerts).mockResolvedValue([alert(1), alert(2)])
  vi.mocked(clearAlerts).mockResolvedValue()
})

describe('useAlerts', () => {
  it('loads the profile\'s alerts and drops cleared ones at once', async () => {
    const { result } = renderHook(() => useAlerts('laura', vi.fn()))
    await waitFor(() => expect(result.current.alerts).toHaveLength(2))
    act(() => result.current.dropAlerts([1]))
    expect(result.current.alerts.map((a) => a.id)).toEqual([2])
    expect(clearAlerts).toHaveBeenCalledWith('laura', [1])
  })

  it('reports a failed clear, and loads nothing without a profile', async () => {
    vi.mocked(clearAlerts).mockRejectedValue(new Error('offline'))
    const onError = vi.fn()
    const { result } = renderHook(() => useAlerts('laura', onError))
    await waitFor(() => expect(result.current.alerts).toHaveLength(2))
    act(() => result.current.dropAlerts())
    await waitFor(() => expect(onError).toHaveBeenCalled())

    renderHook(() => useAlerts(null, vi.fn()))
    expect(getAlerts).toHaveBeenCalledTimes(1)
  })
})
