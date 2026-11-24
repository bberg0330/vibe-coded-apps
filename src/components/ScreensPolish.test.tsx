import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LastWatchedCard } from './LastWatchedCard'
import { HistoryRow } from './HistoryRow'
import { SkeletonRows } from './SkeletonRows'
import { WatchlistControls } from './WatchlistControls'
import { DEFAULT_VIEW } from '../data/watchlistView'
import { PROFILES } from '../data/profiles'

const movie = { tmdbId: 1, title: 'Heat', year: 1995, posterPath: null, tomatometer: 84, popcornmeter: 83 }

describe('LastWatchedCard', () => {
  it('shows the audience score beside the critic score', () => {
    render(<LastWatchedCard movie={{ ...movie, availability: { streaming: [], rent: [] } }} />)
    expect(screen.getByTitle('Critic score')).toHaveTextContent('🍅 84%')
    expect(screen.getByTitle('IMDb user rating')).toHaveTextContent('⭐ 83%')
  })

  it('leaves the audience score out when there is none', () => {
    render(<LastWatchedCard movie={{ ...movie, popcornmeter: null, availability: { streaming: [], rent: [] } }} />)
    expect(screen.queryByTitle('IMDb user rating')).not.toBeInTheDocument()
  })
})

describe('HistoryRow menu', () => {
  it('marks Delete as destructive', () => {
    render(
      <HistoryRow
        entry={{ watchedAt: '2026-01-01T00:00:00.000Z', movie, discoveredVia: null }}
        count={1} isMenuOpen isDeleting={false} onToggleMenu={vi.fn()} onDelete={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Delete this watch' })).toHaveClass('danger')
  })
})

describe('SkeletonRows', () => {
  it('renders placeholder rows hidden from assistive tech, announcing the label instead', () => {
    render(<SkeletonRows label="Loading cast…" />)
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(3)
    screen.getAllByTestId('skeleton-row').forEach((r) => expect(r).toHaveAttribute('aria-hidden', 'true'))
    expect(screen.getByText('Loading cast…')).toHaveClass('sr-only')
  })
})

describe('WatchlistControls', () => {
  it('labels both chip rows, and names each group by its label', () => {
    render(
      <WatchlistControls
        view={DEFAULT_VIEW} profiles={PROFILES} shown={2} total={2} filtered={false}
        onChange={vi.fn()} onOpenSort={vi.fn()} onOpenGenre={vi.fn()} onClearFilters={vi.fn()}
      />,
    )
    expect(screen.getByRole('group', { name: 'Added by' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Filter' })).toBeInTheDocument()
  })
})
