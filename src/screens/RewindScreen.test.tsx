import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RewindScreen } from './RewindScreen'
import { getRewindYears } from '../api/rewind'
import { watchCount } from '../data/history'

vi.mock('../api/rewind', () => ({ getRewindYears: vi.fn() }))
vi.mock('../data/history', () => ({ watchCount: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('RewindScreen', () => {
  it('counts a watched film that dropped out of the list, never past the list size', async () => {
    // 1 and 9 watched; 9 dropped out of 2026's list on a rebuild.
    vi.mocked(watchCount).mockImplementation((id) => (id === 1 || id === 9 ? 1 : 0))
    vi.mocked(getRewindYears).mockResolvedValue([
      { year: 2026, ids: [1, 2, 3], formerIds: [9] },
      { year: 2025, ids: [1], formerIds: [9] },
    ])
    render(<RewindScreen onOpenYear={() => {}} />)
    expect(await screen.findByText('2 of 3 watched')).toBeInTheDocument()
    expect(screen.getByText('1 of 1 watched')).toBeInTheDocument()
  })

  it('says when no years are ready yet', async () => {
    vi.mocked(getRewindYears).mockResolvedValue([])
    render(<RewindScreen onOpenYear={() => {}} />)
    expect(await screen.findByText(/No years are ready yet/)).toBeInTheDocument()
  })
})
