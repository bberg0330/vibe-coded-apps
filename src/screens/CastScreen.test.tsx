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

const cast = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1, name: `Actor ${i + 1}`, character: `Role ${i + 1}`,
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
})
