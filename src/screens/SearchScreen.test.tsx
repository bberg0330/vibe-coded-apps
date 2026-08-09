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

describe('search text persistence', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('restores a previously typed query on mount', async () => {
    sessionStorage.setItem('mn.searchQuery', 'rushmore')
    render(<SearchScreen onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 0} />)

    expect(screen.getByRole('searchbox')).toHaveValue('rushmore')
  })

  it('saves the query as the user types', async () => {
    render(<SearchScreen onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 0} />)
    await userEvent.type(screen.getByRole('searchbox'), 'gladiator')

    expect(sessionStorage.getItem('mn.searchQuery')).toBe('gladiator')
  })
})

describe('search scroll restoration', () => {
  let currentScrollY = 0

  beforeEach(() => {
    sessionStorage.clear()
    currentScrollY = 0
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => currentScrollY,
    })
    vi.stubGlobal('scrollTo', vi.fn((x: number, y: number) => {
      currentScrollY = y
    }))
  })

  // Reproduces the reload bug: SearchScreen starts in `status: 'idle'`, not
  // `'loading'`, so a naive `ready = status !== 'loading'` gate is TRUE at
  // the very first render — before the restored query has even triggered a
  // fetch. The hook would then "restore" against an empty screen (a no-op
  // in jsdom, but a real browser clamps to scrollY 0), and when the search
  // effect flips `status` to `'loading'` moments later, `ready` flips back
  // to `false`, firing the hook's cleanup — which calls `save()` and stamps
  // the now-zero scrollY back over the previously saved position, destroying
  // it before the results ever render.
  it('does not overwrite a saved scroll position while a restored query resolves', async () => {
    sessionStorage.setItem('mn.searchQuery', 'rushmore')
    sessionStorage.setItem('mn.scroll:search', '500')

    render(<SearchScreen onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 0} />)

    // While the restored query is in flight, the saved position must stay
    // untouched — no premature restore-then-erase cycle.
    expect(sessionStorage.getItem('mn.scroll:search')).toBe('500')

    // Let the debounced search resolve to `status: 'done'`.
    expect(await screen.findByText('Rushmore')).toBeInTheDocument()

    // Once settled, the hook restores against the now-populated screen and
    // the saved value must still be intact (not clobbered with '0').
    expect(sessionStorage.getItem('mn.scroll:search')).toBe('500')
    expect(currentScrollY).toBe(500)
  })
})
