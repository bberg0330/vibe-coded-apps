import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FilmographyScreen } from './FilmographyScreen'
import { clearHttpCache } from '../api/http'
import { resetScoresForTests } from '../data/scores'
import { getRottenTomatoesScores } from '../api/omdb'
import type { Person, Movie } from '../types'

// Only `getRottenTomatoesScores` is stubbable, and it delegates to the real
// implementation unless a test overrides it (see beforeEach). That lets one
// test inject a rejecting score lookup without changing how the others behave.
vi.mock('../api/omdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/omdb')>()),
  getRottenTomatoesScores: vi.fn(),
}))
const realOmdb = await vi.importActual<typeof import('../api/omdb')>('../api/omdb')

const actor: Person = {
  tmdbId: 1532, name: 'Bill Murray', profilePath: null,
}
const actorB: Person = {
  tmdbId: 4467, name: 'Owen Wilson', profilePath: null,
}
const fromMovie: Movie = {
  tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: null,
  popularity: 18, tomatometer: null, popcornmeter: null, availability: { streaming: [], rent: [] },
  overview: null,
}

const film = (id: number, title: string) => ({
  id, title, release_date: '2000-01-01', poster_path: null, popularity: 10,
})

function stubApis(opts: {
  films?: Record<string, unknown[]>
  scores?: Record<string, string>
  imdbRatings?: Record<string, string>
} = {}) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/api/scores')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    }
    if (url.startsWith('/api/omdb')) {
      // What the server proxy answers: parsed { critic, audience } scores.
      const title = new URL(url, 'http://localhost').searchParams.get('t') ?? ''
      const rt = opts.scores?.[title]
      const imdb = opts.imdbRatings?.[title]
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => rt
          ? { critic: Number.parseInt(rt, 10), audience: imdb && imdb !== 'N/A' ? Math.round(Number(imdb) * 10) : null }
          : { critic: null, audience: null },
      })
    }
    const providers = new URL(url, 'http://localhost').searchParams.get('with_watch_providers') ?? ''
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ results: opts.films?.[providers] ?? [] }),
    })
  }))
}

beforeEach(() => {
  clearHttpCache()
  resetScoresForTests()
  vi.mocked(getRottenTomatoesScores).mockImplementation(realOmdb.getRottenTomatoesScores)
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

  it('shows the audience score alongside the critic score', async () => {
    stubApis({
      films: { '8': [film(1, 'Groundhog Day')] },
      scores: { 'Groundhog Day': '96%' },
      imdbRatings: { 'Groundhog Day': '8.0' },
    })
    renderScreen()

    expect(await screen.findByText('⭐ 80%')).toBeInTheDocument()
  })

  it('keeps unscored films in the list, at the bottom', async () => {
    stubApis({
      films: { '8': [film(1, 'Unknown'), film(2, 'Known')] },
      scores: { Known: '80%' },
    })
    renderScreen()

    expect(await screen.findByText('Unknown')).toBeInTheDocument()
    expect(await screen.findByText('No critic score')).toBeInTheDocument()
  })

  it('still shows the list when scoring fails entirely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/omdb')) return Promise.reject(new Error('offline'))
      const providers = new URL(url, 'http://localhost').searchParams.get('with_watch_providers') ?? ''
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

  it('keeps the list rendered when one film\'s score lookup rejects', async () => {
    stubApis({ films: { '8': [film(1, 'Survivor'), film(2, 'Rejects')] } })
    // Reproduces production: one film's lookup throws while the rest resolve.
    // The list has already rendered by the time that happens, so the failure
    // must leave it standing rather than replace it with the error state.
    vi.mocked(getRottenTomatoesScores).mockImplementation(async (tmdbId) => {
      if (tmdbId === 2) throw new TypeError("Cannot read properties of null (reading 'critic')")
      return { critic: 90, audience: null }
    })

    renderScreen()

    // The survivor's score landing proves stage two ran to completion.
    expect(await screen.findByText('\u{1F345} 90%')).toBeInTheDocument()
    expect(screen.getByText('Survivor')).toBeInTheDocument()
    expect(screen.getByText('Rejects')).toBeInTheDocument()
    expect(screen.queryByText(/couldn't load this filmography/i)).not.toBeInTheDocument()
  })

  it('leaves the film whose score rejected in the list, unscored', async () => {
    stubApis({ films: { '8': [film(1, 'Survivor'), film(2, 'Rejects')] } })
    vi.mocked(getRottenTomatoesScores).mockImplementation(async (tmdbId) => {
      if (tmdbId === 2) throw new Error('scores unavailable')
      return { critic: 90, audience: null }
    })

    renderScreen()

    expect(await screen.findByText('\u{1F345} 90%')).toBeInTheDocument()
    expect(screen.getByText('No critic score')).toBeInTheDocument()
  })

})
