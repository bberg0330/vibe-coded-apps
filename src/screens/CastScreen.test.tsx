import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CastScreen } from './CastScreen'
import { clearHttpCache } from '../api/http'
import type { Movie } from '../types'

const movie: Movie = {
  tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: null,
  popularity: 18, tomatometer: 90, availability: { streaming: [], rent: [] },
}

const movieB: Movie = {
  tmdbId: 9999, title: 'The Life Aquatic', year: 2004, posterPath: null,
  popularity: 12, tomatometer: 56, availability: { streaming: [], rent: [] },
}

const cast = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1, name: `Actor ${i + 1}`, character: `Role ${i + 1}`,
  profile_path: null, order: i,
}))

const castB = Array.from({ length: 20 }, (_, i) => ({
  id: 1000 + i, name: `Sailor ${i + 1}`, character: `Crew ${i + 1}`,
  profile_path: null, order: i,
}))

beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ cast }),
  }))
})

describe('CastScreen', () => {
  it('shows the movie title', async () => {
    render(<CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />)
    expect(await screen.findByText('Rushmore')).toBeInTheDocument()
  })

  it('shows only the first 15 billed actors initially', async () => {
    render(<CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />)
    expect(await screen.findByText('Actor 15')).toBeInTheDocument()
    expect(screen.queryByText('Actor 16')).not.toBeInTheDocument()
  })

  it('reveals the rest on Show all', async () => {
    render(<CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />)
    await userEvent.click(await screen.findByRole('button', { name: /show all/i }))
    expect(screen.getByText('Actor 20')).toBeInTheDocument()
  })

  it('opens a tapped actor', async () => {
    const onOpenActor = vi.fn()
    render(<CastScreen movie={movie} onOpenActor={onOpenActor} onToggleWatched={vi.fn()} watchedCount={0} />)

    await userEvent.click(await screen.findByRole('button', { name: /actor 1\b/i }))
    expect(onOpenActor).toHaveBeenCalledWith(expect.objectContaining({ name: 'Actor 1' }))
  })

  it('does not render a dead tap target for the header movie', async () => {
    render(<CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />)
    await screen.findByText('Rushmore')

    // The header card has nowhere to navigate to, so its main area must not
    // be a button — only the watch-toggle button should exist for it.
    expect(screen.queryByRole('button', { name: /^rushmore/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark rushmore as watched/i })).toBeInTheDocument()
  })

  it('lets the movie itself be marked watched', async () => {
    const onToggleWatched = vi.fn()
    render(<CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={onToggleWatched} watchedCount={0} />)

    await userEvent.click(await screen.findByRole('button', { name: /mark rushmore as watched/i }))
    expect(onToggleWatched).toHaveBeenCalledWith(movie)
  })

  it('offers a retry when credits fail to load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />)

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('does not show the previous film\'s cast while the next film is loading', async () => {
    const { rerender } = render(
      <CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />,
    )
    expect(await screen.findByText('Actor 1')).toBeInTheDocument()

    // Movie B's fetch stays pending until resolved below, so we can inspect
    // the screen mid-flight — the moment the component holds movie B's props
    // but has not yet received movie B's cast.
    let resolveB!: (value: unknown) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(
      new Promise((resolve) => { resolveB = resolve }),
    ))

    rerender(<CastScreen movie={movieB} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />)

    expect(await screen.findByText('Loading cast…')).toBeInTheDocument()
    expect(screen.queryByText('Actor 1')).not.toBeInTheDocument()
    expect(screen.queryByText('Actor 20')).not.toBeInTheDocument()

    resolveB({ ok: true, status: 200, json: async () => ({ cast: castB }) })
    expect(await screen.findByText('Sailor 1')).toBeInTheDocument()
  })

  it('resets the Show-all expansion when the film changes', async () => {
    const { rerender } = render(
      <CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />,
    )
    await userEvent.click(await screen.findByRole('button', { name: /show all/i }))
    expect(screen.getByText('Actor 20')).toBeInTheDocument()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ cast: castB }),
    }))
    rerender(<CastScreen movie={movieB} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />)

    expect(await screen.findByText('Sailor 15')).toBeInTheDocument()
    expect(screen.queryByText('Sailor 16')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show all/i })).toBeInTheDocument()
  })

  it('keeps the movie header visible while a new film\'s cast is loading', async () => {
    const { rerender } = render(
      <CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />,
    )
    expect(await screen.findByText('Rushmore')).toBeInTheDocument()

    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    rerender(<CastScreen movie={movieB} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />)

    expect(await screen.findByText('Loading cast…')).toBeInTheDocument()
    expect(screen.getByText('The Life Aquatic')).toBeInTheDocument()
  })
})
