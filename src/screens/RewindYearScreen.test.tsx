import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RewindYearScreen } from './RewindYearScreen'
import { whereToWatch } from '../data/providerIds'
import { getRewindYear } from '../api/rewind'
import { getWatchProviders } from '../api/tmdb'
import { watchCount, getSeenBefore } from '../data/history'

vi.mock('../api/rewind', () => ({ getRewindYear: vi.fn() }))
vi.mock('../api/tmdb', () => ({ getWatchProviders: vi.fn(), posterUrl: () => null }))
vi.mock('../data/history', () => ({ watchCount: vi.fn(), getSeenBefore: vi.fn() }))
vi.mock('../data/scores', () => ({ getCachedScores: (id: number) => ({ critic: id * 10, audience: null }) }))
vi.mock('../data/providers', async (orig) => ({ ...(await orig<object>()), getEnabledServices: () => ['netflix'] }))

const film = (tmdbId: number, popularity = 1) =>
  ({ tmdbId, title: `Film ${tmdbId}`, posterPath: null, releaseDate: '2019-05-01', voteAverage: 8, voteCount: 900, popularity })

const props = {
  year: 2019, onBackToRewind: vi.fn(), onOpenFilm: vi.fn(), isOnWatchlist: () => false,
  onToggleWatchlist: vi.fn(), onToggleWatched: vi.fn(), isPending: () => false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSeenBefore).mockReturnValue([])
  vi.mocked(watchCount).mockImplementation((id) => (id === 2 ? 1 : 0))
  vi.mocked(getWatchProviders).mockImplementation(async (id) =>
    id === 1 ? { streaming: ['netflix'], rent: [] } : id === 2 ? { streaming: [], rent: ['youtube'] } : { streaming: ['hbomax'], rent: [] })
})

const titles = () => screen.getAllByText(/^Film \d$/).map((e) => e.textContent)

describe('whereToWatch', () => {
  it('prefers a service you have, then a rental, else nothing', () => {
    expect(whereToWatch({ streaming: ['hbomax', 'netflix'], rent: ['youtube'] }, ['netflix'])).toBe('Stream · Netflix')
    expect(whereToWatch({ streaming: ['hbomax'], rent: ['appletv_store'] }, ['netflix'])).toBe('Rent · Apple TV')
    expect(whereToWatch({ streaming: ['hbomax'], rent: [] }, ['netflix'])).toBeNull()
  })
})

describe('RewindYearScreen', () => {
  it('shows watchable films by default, counting progress against the whole list', async () => {
    vi.mocked(getRewindYear).mockResolvedValue([film(1), film(2), film(3)])
    render(<RewindYearScreen {...props} />)

    expect(await screen.findByText('Stream · Netflix')).toBeInTheDocument()
    expect(await screen.findByText('Rent · YouTube')).toBeInTheDocument()
    expect(titles()).toEqual(['Film 1', 'Film 2'])
    expect(screen.getByText('1 of 3 watched')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '✓ Watchable now' }))
    expect(titles()).toEqual(['Film 1', 'Film 2', 'Film 3'])
    expect(screen.getByText('1 of 3 watched')).toBeInTheDocument()
  })

  it('keeps watched films in the list, and only lets Rewind undo its own marks', async () => {
    vi.mocked(getRewindYear).mockResolvedValue([film(1), film(2)])
    render(<RewindYearScreen {...props} />)

    const watched = await screen.findByRole('button', { name: 'Film 2 watched' })
    expect(watched).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Mark Film 1 as watched' }))
    expect(props.onToggleWatched).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 1 }), { streaming: ['netflix'], rent: [] })
  })

  it('sorts by critic score and popularity, keeping each film\'s rank', async () => {
    vi.mocked(getRewindYear).mockResolvedValue([film(1, 5), film(2, 9)])
    render(<RewindYearScreen {...props} />)
    await screen.findByText('Film 2')

    await userEvent.click(screen.getByRole('button', { name: 'Sort: Rating ▾' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: 'Critic score' }))
    expect(titles()).toEqual(['Film 2', 'Film 1'])
    expect(screen.getByLabelText('Number 2')).toBeInTheDocument()
  })

  it('says a year that is not ready unlocks soon', async () => {
    vi.mocked(getRewindYear).mockResolvedValue(null)
    render(<RewindYearScreen {...props} year={1987} />)

    expect(await screen.findByRole('heading', { name: 'Rewind 1987 unlocks soon' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back to Rewind' }))
    expect(props.onBackToRewind).toHaveBeenCalled()
  })
})
