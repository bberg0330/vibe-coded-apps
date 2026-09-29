import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { clearHttpCache } from './api/http'
import { getHistory } from './data/history'
import { getAllWatchingTonight, startWatching } from './data/watching'
import { resetStoreForTests, getStoreSnapshot } from './data/store'
import { applyOp } from '../vite-plugins/store-ops'
import { emptyStore } from './types'
import type { StoreOp, Movie } from './types'
import { hashFor } from './router'
import { PROFILES, type ProfileId } from './data/profiles'
import { getActiveProfileId, setActiveProfileId } from './data/activeProfile'

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
  window.location.hash = ''
  clearHttpCache()
  resetStoreForTests()
  localStorage.clear()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
  stubAppServer()
})

/**
 * Renders the app past the "who's watching" gate, exactly as if this
 * device had already confirmed a profile on a previous visit — most tests
 * care about screens beyond the gate, not the gate itself (see the
 * dedicated "App - profile gate" suite below for that).
 */
async function renderApp(profileId: ProfileId = PROFILES[0].id) {
  setActiveProfileId(profileId)
  const utils = render(<App />)
  await screen.findByRole('searchbox')
  return utils
}

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
    await renderApp()
    await tapWatchButton()
    await waitFor(() => expect(getHistory()).toHaveLength(1))

    await userEvent.click(await screen.findByRole('button', { name: /undo watched for rushmore/i }))
    await waitFor(() => expect(getHistory()).toHaveLength(0))
  })

  it(
    'ignores a rapid second tap while the first save is still in flight ' +
    '(reproduces the production bug: two taps landing in the same tick double-logged a watch)',
    async () => {
      await renderApp()
      await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
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
      const { unmount } = await renderApp()
      await tapWatchButton()
      await waitFor(() => expect(getHistory()).toHaveLength(1))

      // Simulate a new session: unmount and remount, which resets the
      // in-session "logged this session" tracking but leaves the shared
      // store's history intact — exactly what happens when the app is
      // reopened later. The profile is still persisted from before, same
      // as a real reopen.
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
    // No profile persisted yet, so the app past boot is the "who's
    // watching" gate, not the homepage — this only asserts boot finished.
    expect(await screen.findByText(/who's watching\?/i)).toBeInTheDocument()
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

    expect(await screen.findByText(/who's watching\?/i)).toBeInTheDocument()
  })
})

describe('App - URL navigation', () => {
  it('normalizes an empty hash to the root route on first load', async () => {
    await renderApp()
    expect(window.location.hash).toBe('#/')
  })

  it('pushes a hash when navigating to a movie', async () => {
    await renderApp()
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /^rushmore/i }))

    expect(window.location.hash).toBe(hashFor({
      kind: 'cast', movie: { tmdbId: 1585, title: 'Rushmore' } as Movie,
    }))
  })

  it('rehydrates a cast screen from a cold hash with no in-memory history', async () => {
    const movieDetails = {
      id: 1585, title: 'Rushmore', release_date: '1998-10-09',
      poster_path: null, popularity: 18,
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/store')) {
        if (init?.method === 'POST') {
          const op = JSON.parse(String(init.body)) as StoreOp
          return { ok: true, status: 200, json: async () => applyOp(getStoreSnapshot(), op) }
        }
        return { ok: true, status: 200, json: async () => getStoreSnapshot() }
      }
      if (String(url).includes('/movie/1585')) {
        return { ok: true, status: 200, json: async () => movieDetails }
      }
      return { ok: true, status: 200, json: async () => rushmoreSearchResults }
    }))
    window.location.hash = '#/movie/rushmore-1585'
    setActiveProfileId(PROFILES[0].id)

    render(<App />)

    expect(await screen.findByRole('button', { name: /mark rushmore as watched/i }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: /← Back/i })).toBeInTheDocument()
  })

  it('falls back to search with a message when rehydration fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/store')) {
        return { ok: true, status: 200, json: async () => getStoreSnapshot() }
      }
      throw new Error('not found')
    }))
    window.location.hash = '#/movie/rushmore-1585'
    setActiveProfileId(PROFILES[0].id)

    render(<App />)

    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
    expect(await screen.findByText(/couldn't open that link/i)).toBeInTheDocument()
  })

  it('moves back via popstate without refetching an already-visited screen', async () => {
    await renderApp()
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /^rushmore/i }))
    await screen.findByRole('button', { name: /mark rushmore as watched/i })

    const fetchCallsBeforeBack = (fetch as ReturnType<typeof vi.fn>).mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: /← Back/i }))

    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
    // Going back to a screen already held in memory must not hit the network again.
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsBeforeBack)
  })

  it('moves back via a raw popstate event, identically to the Back button', async () => {
    await renderApp()
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /^rushmore/i }))
    await screen.findByRole('button', { name: /mark rushmore as watched/i })

    const fetchCallsBeforeBack = (fetch as ReturnType<typeof vi.fn>).mock.calls.length

    // Dispatch the raw browser gesture directly, instead of clicking the
    // on-screen Back button — proving the button is just a thin wrapper
    // around `history.back()` and not a separate code path.
    window.dispatchEvent(new PopStateEvent('popstate', { state: { pointer: 0 } }))

    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
    // Same outcome as clicking Back: the already-visited search screen is
    // restored from memory, with no extra network round-trip.
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsBeforeBack)
  })

  it('closes Settings on back rather than navigating the screen stack', async () => {
    await renderApp()
    await userEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(await screen.findByText('Our subscriptions')).toBeInTheDocument()

    window.dispatchEvent(new PopStateEvent('popstate', { state: { pointer: 0 } }))

    expect(screen.queryByText('Our subscriptions')).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })
})

describe('App - profile gate', () => {
  it('blocks the homepage until a profile is picked and confirmed', async () => {
    render(<App />)

    expect(await screen.findByText(/who's watching\?/i)).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    for (const profile of PROFILES) {
      expect(screen.getByRole('radio', { name: profile.name })).toBeInTheDocument()
    }
  })

  it('keeps Continue disabled, and does nothing on click, until a profile is picked', async () => {
    render(<App />)
    await screen.findByText(/who's watching\?/i)

    const continueButton = screen.getByRole('button', { name: /continue/i })
    expect(continueButton).toBeDisabled()

    await userEvent.click(continueButton)
    expect(screen.getByText(/who's watching\?/i)).toBeInTheDocument()
    expect(getActiveProfileId()).toBeNull()
  })

  it('highlights the tapped profile without committing it until Continue is pressed', async () => {
    render(<App />)
    await screen.findByText(/who's watching\?/i)

    const laura = screen.getByRole('radio', { name: PROFILES[0].name })
    await userEvent.click(laura)

    expect(laura).toHaveAttribute('aria-checked', 'true')
    // Still gated — tapping a name only stages the choice.
    expect(screen.getByText(/who's watching\?/i)).toBeInTheDocument()
    expect(getActiveProfileId()).toBeNull()
  })

  it('commits the picked profile and reveals the homepage on Continue', async () => {
    render(<App />)
    await screen.findByText(/who's watching\?/i)

    await userEvent.click(screen.getByRole('radio', { name: PROFILES[0].name }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
    expect(screen.queryByText(/who's watching\?/i)).not.toBeInTheDocument()
    expect(getActiveProfileId()).toBe(PROFILES[0].id)
    expect(screen.getByRole('button', { name: PROFILES[0].name })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('App - profile switcher', () => {
  it('shows a chip for every configured profile once past the gate', async () => {
    await renderApp()

    for (const profile of PROFILES) {
      expect(screen.getByRole('button', { name: profile.name })).toBeInTheDocument()
    }
  })

  it('persists a topbar profile switch across a simulated reload', async () => {
    const { unmount } = await renderApp(PROFILES[0].id)

    const chip = screen.getByRole('button', { name: PROFILES[1].name })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    // Simulate a fresh app load: unmount and remount, re-reading whatever
    // was persisted to localStorage rather than any in-memory state.
    unmount()
    render(<App />)
    await screen.findByRole('searchbox')

    expect(screen.getByRole('button', { name: PROFILES[1].name }))
      .toHaveAttribute('aria-pressed', 'true')
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

    await renderApp()
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /mark rushmore as watched/i }))

    expect(await screen.findByText(/couldn't save/i)).toBeInTheDocument()
    // The button must NOT look logged.
    expect(screen.getByRole('button', { name: /mark rushmore as watched/i }))
      .toHaveAttribute('aria-pressed', 'false')
  })
})

describe('App - cancelWatchingTonight', () => {
  const rushmore: Movie = {
    tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: null, popularity: 18,
    tomatometer: null, popcornmeter: null, availability: { streaming: [], rent: [] },
    overview: null,
  }

  it('removes the Tonight row from HistoryScreen when its cancel control is tapped', async () => {
    await renderApp(PROFILES[0].id)
    // Nothing in the UI starts "watching tonight" any more, so seed an
    // existing entry through the data layer.
    await startWatching(rushmore, PROFILES[0].id, null)
    await waitFor(() => expect(getAllWatchingTonight()).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: /^history$/i }))
    expect(await screen.findByTestId('tonight-title')).toHaveTextContent('Rushmore')

    await userEvent.click(screen.getByRole('button', { name: /undo watching rushmore tonight/i }))

    await waitFor(() => expect(getAllWatchingTonight()).toHaveLength(0))
    expect(screen.queryByTestId('tonight-title')).not.toBeInTheDocument()
  })

  it('reverts the row and shows an error when the cancel save fails', async () => {
    await renderApp(PROFILES[0].id)
    // Nothing in the UI starts "watching tonight" any more, so seed an
    // existing entry through the data layer.
    await startWatching(rushmore, PROFILES[0].id, null)
    await waitFor(() => expect(getAllWatchingTonight()).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: /^history$/i }))
    await screen.findByTestId('tonight-title')

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/store') && init?.method === 'POST') {
        throw new Error('offline')
      }
      return { ok: true, status: 200, json: async () => getStoreSnapshot() }
    }))

    await userEvent.click(screen.getByRole('button', { name: /undo watching rushmore tonight/i }))

    expect(await screen.findByText(/couldn't save/i)).toBeInTheDocument()
    // The entry must reappear — the cancel did not actually happen.
    expect(await screen.findByTestId('tonight-title')).toHaveTextContent('Rushmore')
    expect(getAllWatchingTonight()).toHaveLength(1)
  })
})
