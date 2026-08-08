import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchScreen } from './SearchScreen'
import { clearHttpCache } from '../api/http'

beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({
      results: [{
        id: 1585, title: 'Rushmore', release_date: '1998-10-09',
        poster_path: null, popularity: 18,
      }],
    }),
  }))
})

const noop = () => {}

describe('SearchScreen', () => {
  it('shows results for a typed query', async () => {
    render(<SearchScreen onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 0} />)
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')

    expect(await screen.findByText('Rushmore')).toBeInTheDocument()
  })

  it('opens a tapped result', async () => {
    const onOpenMovie = vi.fn()
    render(<SearchScreen onOpenMovie={onOpenMovie} onToggleWatched={vi.fn()} watchCountFor={() => 0} />)
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')

    // Anchored: an unanchored /rushmore/i also matches the watch button's
    // aria-label ("Mark Rushmore as watched"), which throws "multiple elements found".
    await userEvent.click(await screen.findByRole('button', { name: /^rushmore/i }))
    expect(onOpenMovie).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 1585 }))
  })

  it('logs a watch for a directly searched result', async () => {
    const onToggleWatched = vi.fn()
    render(<SearchScreen onOpenMovie={vi.fn()} onToggleWatched={onToggleWatched} watchCountFor={() => 0} />)
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')

    await userEvent.click(await screen.findByRole('button', { name: /mark rushmore as watched/i }))
    expect(onToggleWatched).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 1585 }))
  })

  it('reflects the real watch count for a result already in history', async () => {
    render(<SearchScreen onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 1} />)
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')

    expect(await screen.findByRole('button', { name: /undo watched for rushmore/i })).toBeInTheDocument()
  })

  it('reports an empty search honestly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ results: [] }),
    }))
    render(<SearchScreen onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 0} />)
    await userEvent.type(screen.getByRole('searchbox'), 'zzzz')

    expect(await screen.findByText(/no movies found/i)).toBeInTheDocument()
  })

  it('offers a retry when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<SearchScreen onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 0} />)
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows setup guidance when the TMDB key is missing', async () => {
    vi.stubEnv('VITE_TMDB_TOKEN', '')
    render(<SearchScreen onOpenMovie={vi.fn()} onToggleWatched={noop} watchCountFor={() => 0} />)
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')

    await waitFor(() => {
      expect(screen.getByText(/VITE_TMDB_TOKEN/)).toBeInTheDocument()
    })
  })
})
