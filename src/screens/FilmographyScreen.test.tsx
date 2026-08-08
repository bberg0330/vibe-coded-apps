import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FilmographyScreen } from './FilmographyScreen'
import { clearHttpCache } from '../api/http'
import type { CastMember, Movie } from '../types'

const actor: CastMember = {
  tmdbId: 1532, name: 'Bill Murray', character: 'Herman Blume',
  profilePath: null, order: 1,
}
const actorB: CastMember = {
  tmdbId: 4467, name: 'Owen Wilson', character: 'Dirk Calloway',
  profilePath: null, order: 2,
}
const fromMovie: Movie = {
  tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: null,
  popularity: 18, tomatometer: null, availability: { streaming: [], rent: [] },
}

const film = (id: number, title: string) => ({
  id, title, release_date: '2000-01-01', poster_path: null, popularity: 10,
})

function stubApis(opts: { films?: Record<string, unknown[]>; scores?: Record<string, string> } = {}) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('omdbapi.com')) {
      const title = new URL(url).searchParams.get('t') ?? ''
      const rt = opts.scores?.[title]
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => rt
          ? { Response: 'True', Title: title, Year: '2000', Ratings: [{ Source: 'Rotten Tomatoes', Value: rt }] }
          : { Response: 'False', Error: 'Movie not found!' },
      })
    }
    const providers = new URL(url).searchParams.get('with_watch_providers') ?? ''
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ results: opts.films?.[providers] ?? [] }),
    })
  }))
}

beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
  vi.stubEnv('VITE_OMDB_KEY', 'test-key')
})

const renderScreen = () => render(
  <FilmographyScreen
    actor={actor} fromMovie={fromMovie}
    onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 0} />,
)

describe('FilmographyScreen', () => {
  it('shows the actor name', async () => {
    stubApis()
    renderScreen()
    expect(await screen.findByText('Bill Murray')).toBeInTheDocument()
  })

  it('lists streaming films under a streaming heading', async () => {
    stubApis({ films: { '8': [film(1, 'Groundhog Day')] } })
    renderScreen()

    expect(await screen.findByText('Groundhog Day')).toBeInTheDocument()
    expect(screen.getByText(/streaming now/i)).toBeInTheDocument()
  })

  it('reorders by tomatometer once scores arrive', async () => {
    stubApis({
      films: { '8': [film(1, 'Worse'), film(2, 'Better')] },
      scores: { Worse: '40%', Better: '95%' },
    })
    renderScreen()

    await waitFor(() => {
      const titles = screen.getAllByRole('button', { name: /worse|better/i })
        .map((b) => b.textContent ?? '')
      expect(titles[0]).toContain('Better')
    })
  })

  it('keeps unscored films in the list, at the bottom', async () => {
    stubApis({
      films: { '8': [film(1, 'Unknown'), film(2, 'Known')] },
      scores: { Known: '80%' },
    })
    renderScreen()

    expect(await screen.findByText('Unknown')).toBeInTheDocument()
    expect(await screen.findByText('No score')).toBeInTheDocument()
  })

  it('still shows the list when scoring fails entirely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('omdbapi.com')) return Promise.reject(new Error('offline'))
      const providers = new URL(url).searchParams.get('with_watch_providers') ?? ''
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ results: providers === '8' ? [film(1, 'Still Here')] : [] }),
      })
    }))
    renderScreen()

    expect(await screen.findByText('Still Here')).toBeInTheDocument()
  })

  it('shows the rent section when nothing streams', async () => {
    stubApis({ films: { '2': [film(9, 'Rental Only')] } })
    renderScreen()

    expect(await screen.findByText('Rental Only')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rent' })).toBeInTheDocument()
  })

  it('says so plainly when there is nothing at all', async () => {
    stubApis({ films: {} })
    renderScreen()

    expect(await screen.findByText(/nothing from bill murray/i)).toBeInTheDocument()
  })

  it('offers a retry when discover fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderScreen()

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('does not show the previous actor\'s films while the next actor is loading', async () => {
    stubApis({ films: { '8': [film(1, 'Groundhog Day')] } })
    const { rerender } = render(
      <FilmographyScreen
        actor={actor} fromMovie={fromMovie}
        onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 0} />,
    )
    expect(await screen.findByText('Groundhog Day')).toBeInTheDocument()

    // Actor B's discover call stays pending until resolved below, so we can
    // inspect the screen mid-flight — the moment the component holds actor
    // B's props but has not yet received actor B's films.
    let resolveB!: (value: unknown) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(
      new Promise((resolve) => { resolveB = resolve }),
    ))

    rerender(
      <FilmographyScreen
        actor={actorB} fromMovie={fromMovie}
        onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 0} />,
    )

    expect(await screen.findByText('Owen Wilson')).toBeInTheDocument()
    expect(screen.queryByText('Groundhog Day')).not.toBeInTheDocument()

    resolveB({ ok: true, status: 200, json: async () => ({ results: [] }) })
    expect(await screen.findByText(/nothing from owen wilson/i)).toBeInTheDocument()
  })
})
