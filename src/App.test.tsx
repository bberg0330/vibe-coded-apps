import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { clearHttpCache } from './api/http'
import { getHistory } from './data/history'
import { resetStoreForTests, getStoreSnapshot } from './data/store'
import { applyOp } from '../vite-plugins/store-ops'
import { emptyStore } from './types'
import type { StoreOp } from './types'

const rushmoreSearchResults = {
  results: [{
    id: 1585, title: 'Rushmore', release_date: '1998-10-09',
    poster_path: null, popularity: 18,
  }],
}

/**
 * A fake server for both endpoints the app calls: TMDB search, and the
 * shared store. Store writes are applied to the current snapshot and
 * echoed back, exactly like the real dev-server plugin does.
 */
function stubAppServer() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('/api/store')) {
      if (init?.method === 'POST') {
        const op = JSON.parse(String(init.body)) as StoreOp
        const next = applyOp(getStoreSnapshot(), op)
        return { ok: true, status: 200, json: async () => next }
      }
      return { ok: true, status: 200, json: async () => getStoreSnapshot() }
    }
    return { ok: true, status: 200, json: async () => rushmoreSearchResults }
  }))
}

beforeEach(() => {
  clearHttpCache()
  resetStoreForTests()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
  stubAppServer()
})

// The watch button's label reflects real lifetime watchCount (via MovieCard's
// `watched` prop), not session state — so after a remount with existing
// history it already reads "Undo watched", even though tapping it must
// append (this session hasn't logged it) rather than delete.
async function tapWatchButton() {
  await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
  const button = await screen.findByRole(
    'button',
    { name: /^(mark rushmore as watched|undo watched for rushmore)$/i },
  )
  await userEvent.click(button)
}

describe('App - toggleWatched session scoping', () => {
  it('undoes a same-session tap, removing the entry it just added', async () => {
    render(<App />)
    await screen.findByRole('searchbox')
    await tapWatchButton()
    await waitFor(() => expect(getHistory()).toHaveLength(1))

    await userEvent.click(await screen.findByRole('button', { name: /undo watched for rushmore/i }))
    await waitFor(() => expect(getHistory()).toHaveLength(0))
  })

  it(
    'ignores a rapid second tap while the first save is still in flight ' +
    '(reproduces the production bug: two taps landing in the same tick double-logged a watch)',
    async () => {
      render(<App />)
      await userEvent.type(await screen.findByRole('searchbox'), 'rushmore')
      const button = await screen.findByRole('button', { name: /mark rushmore as watched/i })

      // fireEvent, not userEvent: userEvent awaits each click to full
      // settlement, which can never reproduce a race. Firing both
      // synchronously, before either's async work resolves, is what
      // actually happened when the button was tapped twice quickly.
      fireEvent.click(button)
      fireEvent.click(button)

      await waitFor(() => expect(getHistory()).toHaveLength(1))
    },
  )

  it(
    'appends rather than deletes when the film was logged in a PREVIOUS session ' +
    '(the exact data-loss bug: logging last year then tapping tonight must not erase last year\'s entry)',
    async () => {
      const { unmount } = render(<App />)
      await screen.findByRole('searchbox')
      await tapWatchButton()
      await waitFor(() => expect(getHistory()).toHaveLength(1))

      // Simulate a new session: unmount and remount, which resets the
      // in-session "logged this session" tracking but leaves the shared
      // store's history intact — exactly what happens when the app is
      // reopened later.
      unmount()
      render(<App />)
      await screen.findByRole('searchbox')

      await tapWatchButton()

      // The critical assertion: two entries, not zero. A previous-session
      // watch must never be silently undone by a later tap.
      await waitFor(() => expect(getHistory()).toHaveLength(2))
    },
  )
})

describe('App startup', () => {
  it('shows a loading state, then the app', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => emptyStore(),
    }))

    render(<App />)
    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
  })

  it('shows a clear error, NOT an empty history, when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<App />)

    expect(await screen.findByText(/can't reach the movie night server/i)).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('retries loading when the retry control is used', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
      ok: true, status: 200, json: async () => emptyStore(),
    })
    vi.stubGlobal('fetch', f)

    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /try again/i }))

    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
  })
})

describe('write failure', () => {
  it('reverts the watch button and tells the user when the save fails', async () => {
    const movie = {
      id: 1585, title: 'Rushmore', release_date: '1998-10-09',
      poster_path: null, popularity: 18,
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/store') && init?.method === 'POST') {
        throw new Error('offline')
      }
      if (String(url).startsWith('/api/store')) {
        return { ok: true, status: 200, json: async () => emptyStore() }
      }
      return { ok: true, status: 200, json: async () => ({ results: [movie] }) }
    }))

    render(<App />)
    await userEvent.type(await screen.findByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /mark rushmore as watched/i }))

    expect(await screen.findByText(/couldn't save/i)).toBeInTheDocument()
    // The button must NOT look logged.
    expect(screen.getByRole('button', { name: /mark rushmore as watched/i }))
      .toHaveAttribute('aria-pressed', 'false')
  })
})
