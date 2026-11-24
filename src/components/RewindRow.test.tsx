import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RewindRow } from './RewindRow'

const base = {
  rank: 3, title: 'Parasite', posterPath: null, scores: { critic: 99, audience: 86 }, where: 'Stream · Max',
  watched: false, onWatchlist: false, onOpen: vi.fn(), onToggleWatchlist: vi.fn(), onToggleWatched: vi.fn(),
}

describe('RewindRow', () => {
  it('shows rank, scores and where to watch, and routes its two actions', async () => {
    render(<RewindRow {...base} />)
    expect(screen.getByLabelText('Number 3')).toBeInTheDocument()
    expect(screen.getByText('Stream · Max')).toBeInTheDocument()
    expect(screen.getByText(/critic score/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add Parasite to watchlist' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark Parasite as watched' }))
    expect(base.onToggleWatchlist).toHaveBeenCalled()
    expect(base.onToggleWatched).toHaveBeenCalled()
  })

  it('stays in the list when watched, and only lets Rewind undo its own marks', () => {
    const { rerender } = render(<RewindRow {...base} watched canUnmark />)
    expect(screen.getByRole('button', { name: 'Parasite watched. Unmark' })).toBeEnabled()
    rerender(<RewindRow {...base} watched canUnmark={false} />)
    expect(screen.getByRole('button', { name: 'Parasite watched' })).toBeDisabled()
  })
})
