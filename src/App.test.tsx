import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { clearHttpCache } from './api/http'
import { getHistory, getSeenBefore } from './data/history'
import { getAllWatchingTonight } from './data/watching'
import { seedWatching } from './data/watching.testutil'
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
    if (String(url).startsWith('/api/session')) {
      if (init?.method === 'POST') {
        const { passcode } = JSON.parse(String(init.body)) as { passcode: string }
        return passcode === 'popcorn'
          ? { ok: true, status: 200, json: async () => ({ token: 'fresh-token' }) }
          : { ok: false, status: 401, json: async () => ({ error: 'wrong_passcode' }) }
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }
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
  // Most tests are about screens past the passcode gate: start unlocked.
  // The "App - passcode gate" suite clears this to test the gate itself.
  localStorage.setItem('mn.session', 'test-token')
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
  // A film with no history asks when first (Mark as watched sheet); one already
  // in history logs straight away, so only pick Tonight if the sheet opened.
  const tonight = screen.queryByRole('radio', { name: 'Tonight' })
  if (tonight) await userEvent.click(tonight)
}

/** The ✓ on a film with no history opens the sheet; this picks one of its rows. */
async function chooseWhen(when: 'Tonight' | 'Some time ago') {
  await userEvent.click(await screen.findByRole('radio', { name: when }))
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
      // The ✓ opens the sheet; the race is now two quick taps on its Tonight row.
      const tonight = await screen.findByRole('radio', { name: 'Tonight' })
      fireEvent.click(tonight)
      fireEvent.click(tonight)

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
    const f = vi.fn()
      // The session check goes first and succeeds; the store load then fails once.
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
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
    expect(screen.getByRole('button', { name: `Watching as ${PROFILES[0].name}. Switch profile` })).toBeInTheDocument()
  })
})

describe('App - profile switcher', () => {
  const avatar = (name: string) => screen.getByRole('button', { name: `Watching as ${name}. Switch profile` })

  it('shows the active profile as an avatar that opens a picker of every profile', async () => {
    await renderApp(PROFILES[0].id)

    expect(avatar(PROFILES[0].name)).toHaveTextContent(PROFILES[0].name[0].toUpperCase())
    await userEvent.click(avatar(PROFILES[0].name))

    const sheet = screen.getByRole('dialog', { name: "Who's watching" })
    for (const profile of PROFILES) {
      expect(within(sheet).getByRole('radio', { name: profile.name })).toBeInTheDocument()
    }
  })

  it('persists a profile switch across a simulated reload', async () => {
    const { unmount } = await renderApp(PROFILES[0].id)

    await userEvent.click(avatar(PROFILES[0].name))
    await userEvent.click(screen.getByRole('radio', { name: PROFILES[1].name }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(avatar(PROFILES[1].name)).toBeInTheDocument()

    // Simulate a fresh app load: unmount and remount, re-reading whatever
    // was persisted to localStorage rather than any in-memory state.
    unmount()
    render(<App />)
    await screen.findByRole('searchbox')

    expect(avatar(PROFILES[1].name)).toBeInTheDocument()
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
    await chooseWhen('Tonight')

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
    seedWatching(rushmore, PROFILES[0].id, null)
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
    seedWatching(rushmore, PROFILES[0].id, null)
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

describe('App - passcode gate', () => {
  beforeEach(() => {
    localStorage.removeItem('mn.session')
    setActiveProfileId(PROFILES[0].id)
  })

  it('shows the passcode screen, and loads nothing else, until unlocked', async () => {
    render(<App />)

    expect(await screen.findByText('Enter the passcode')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    const urls = vi.mocked(fetch).mock.calls.map(([u]) => String(u))
    expect(urls.some((u) => u.startsWith('/api/store'))).toBe(false)
  })

  it('says so when the passcode is wrong, and stays locked', async () => {
    render(<App />)

    await userEvent.type(await screen.findByLabelText('Passcode'), 'nachos')
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }))

    expect(await screen.findByText("That passcode didn't work. Try again.")).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('unlocks with the right passcode, keeps the token, and sends it on API calls', async () => {
    render(<App />)

    await userEvent.type(await screen.findByLabelText('Passcode'), 'popcorn{Enter}')

    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
    expect(localStorage.getItem('mn.session')).toBe('fresh-token')
    const storeCall = vi.mocked(fetch).mock.calls.find(([u]) => String(u).startsWith('/api/store'))
    expect(new Headers(storeCall?.[1]?.headers).get('Authorization')).toBe('Bearer fresh-token')
  })

  it('drops back to the passcode screen when the server rejects the token', async () => {
    localStorage.setItem('mn.session', 'revoked-token')
    vi.mocked(fetch).mockImplementation(async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response)

    render(<App />)

    expect(await screen.findByText('Enter the passcode')).toBeInTheDocument()
    expect(localStorage.getItem('mn.session')).toBeNull()
  })
})

describe('App - watchlist', () => {
  const onList = () => getStoreSnapshot().watchlist.map((e) => e.movie.tmdbId)

  it('adds a search result to the shared watchlist, attributed to the active profile', async () => {
    await renderApp('brian')
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /add rushmore to watchlist/i }))

    await waitFor(() => expect(onList()).toEqual([1585]))
    expect(getStoreSnapshot().watchlist[0].profileId).toBe('brian')
    expect(await screen.findByRole('button', { name: /remove rushmore from watchlist/i }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('tapping the filled bookmark takes it back off the list', async () => {
    await renderApp()
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /add rushmore to watchlist/i }))
    await waitFor(() => expect(onList()).toEqual([1585]))

    await userEvent.click(await screen.findByRole('button', { name: /remove rushmore from watchlist/i }))
    await waitFor(() => expect(onList()).toEqual([]))
  })

  it('marking a listed film watched removes it, and undoing the ✓ puts it back as it was', async () => {
    await renderApp('laura')
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /add rushmore to watchlist/i }))
    await waitFor(() => expect(onList()).toEqual([1585]))
    const addedAt = getStoreSnapshot().watchlist[0].addedAt

    await userEvent.click(await screen.findByRole('button', { name: /mark rushmore as watched/i }))
    await chooseWhen('Tonight')
    await waitFor(() => expect(getHistory()).toHaveLength(1))
    expect(onList()).toEqual([])

    await userEvent.click(await screen.findByRole('button', { name: /undo watched for rushmore/i }))
    await waitFor(() => expect(getHistory()).toHaveLength(0))
    await waitFor(() => expect(onList()).toEqual([1585]))
    expect(getStoreSnapshot().watchlist[0]).toMatchObject({ addedAt, profileId: 'laura' })
  })

  it('shows Up next on the homescreen and the full list on the Watchlist screen', async () => {
    // Up next only shows with an empty query; earlier tests leave one behind.
    sessionStorage.clear()
    resetStoreForTests({
      ...emptyStore(),
      watchlist: [1, 2, 3].map((id) => ({
        addedAt: `2026-0${id}-01T00:00:00.000Z`,
        profileId: id === 2 ? 'brian' : 'laura',
        movie: { tmdbId: id, title: `Film ${id}`, year: 2000, posterPath: null, tomatometer: null, popcornmeter: null },
      })),
    })
    await renderApp()

    const upNext = screen.getByRole('region', { name: 'Up next' })
    // Newest two only.
    expect([...upNext.querySelectorAll('[data-testid="watchlist-title"]')].map((n) => n.textContent))
      .toEqual(['Film 3', 'Film 2'])

    await userEvent.click(screen.getByRole('button', { name: 'See all 3' }))
    expect(window.location.hash).toBe('#/watchlist')
    expect(await screen.findByRole('heading', { name: 'Watchlist' })).toBeInTheDocument()
    expect(screen.getAllByTestId('watchlist-title')).toHaveLength(3)
    expect(screen.getByText(/Added by Brian/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /remove film 1 from watchlist/i }))
    await waitFor(() => expect(screen.getAllByTestId('watchlist-title')).toHaveLength(2))
    expect(getHistory()).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: /mark film 3 as watched/i }))
    await chooseWhen('Tonight')
    await waitFor(() => expect(getHistory()).toHaveLength(1))
    expect(screen.getAllByTestId('watchlist-title').map((n) => n.textContent)).toEqual(['Film 2'])
  })

  it('reaches the Watchlist screen from the tab bar, showing the empty state', async () => {
    await renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Watchlist' }))
    expect(await screen.findByText(/Nothing saved yet/)).toBeInTheDocument()
  })
})

describe('App - undo toast', () => {
  const film = (id: number, title: string) =>
    ({ tmdbId: id, title, year: 2000, posterPath: null, tomatometer: null, popcornmeter: null })

  it('offers Undo after × on a watchlist row, and Undo puts it back exactly as it was', async () => {
    resetStoreForTests({
      ...emptyStore(),
      watchlist: [{ addedAt: '2026-01-01T00:00:00.000Z', profileId: 'brian', movie: film(7, 'Heat') }],
    })
    await renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Watchlist' }))
    await userEvent.click(await screen.findByRole('button', { name: /remove heat from watchlist/i }))

    expect(await screen.findByRole('status')).toHaveTextContent('Removed Heat')
    await waitFor(() => expect(getStoreSnapshot().watchlist).toHaveLength(0))

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(getStoreSnapshot().watchlist).toHaveLength(1))
    expect(getStoreSnapshot().watchlist[0])
      .toMatchObject({ addedAt: '2026-01-01T00:00:00.000Z', profileId: 'brian' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('hides a deleted watch at once but only deletes it once the toast goes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      resetStoreForTests({
        ...emptyStore(),
        history: [{ watchedAt: '2026-02-01T00:00:00.000Z', movie: film(8, 'Heat'), discoveredVia: null }],
      })
      await renderApp()
      await userEvent.click(screen.getByRole('button', { name: /^history$/i }))
      await userEvent.click(await screen.findByRole('button', { name: /menu for heat/i }))
      await userEvent.click(screen.getByRole('button', { name: /delete this watch/i }))

      expect(screen.getByRole('status')).toHaveTextContent('Deleted your Heat watch')
      expect(screen.queryByTestId('history-title')).not.toBeInTheDocument()
      expect(getHistory()).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(5000)
      await waitFor(() => expect(getHistory()).toHaveLength(0))
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Undo on a deleted watch brings the row back without touching the store', async () => {
    resetStoreForTests({
      ...emptyStore(),
      history: [{ watchedAt: '2026-02-01T00:00:00.000Z', movie: film(8, 'Heat'), discoveredVia: null }],
    })
    await renderApp()
    await userEvent.click(screen.getByRole('button', { name: /^history$/i }))
    await userEvent.click(await screen.findByRole('button', { name: /menu for heat/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete this watch/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(await screen.findByTestId('history-title')).toHaveTextContent('Heat')
    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts.map(([, init]) => (JSON.parse(String(init!.body)) as StoreOp).type)).not.toContain('deleteWatch')
  })

  it('a second undoable action commits the first', async () => {
    resetStoreForTests({
      ...emptyStore(),
      history: [
        { watchedAt: '2026-02-01T00:00:00.000Z', movie: film(8, 'Heat'), discoveredVia: null },
        { watchedAt: '2026-02-02T00:00:00.000Z', movie: film(9, 'Ronin'), discoveredVia: null },
      ],
    })
    await renderApp()
    await userEvent.click(screen.getByRole('button', { name: /^history$/i }))
    await userEvent.click(await screen.findByRole('button', { name: /menu for heat/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete this watch/i }))
    await userEvent.click(screen.getByRole('button', { name: /menu for ronin/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete this watch/i }))

    await waitFor(() => expect(getHistory().map((e) => e.movie.title)).toEqual(['Ronin']))
    expect(screen.getByRole('status')).toHaveTextContent('Deleted your Ronin watch')
  })
})

describe('App - tab bar', () => {
  // Which tab is marked current, and ignoring taps on it, is TabBar.test.tsx's job; this checks the app navigates.
  it('switches screens from the tab bar', async () => {
    await renderApp()
    const tabs = screen.getByRole('navigation', { name: 'Main' })
    await userEvent.click(within(tabs).getByRole('button', { name: 'Watchlist' }))
    await screen.findByText(/Nothing saved yet/)

    await userEvent.click(within(tabs).getByRole('button', { name: 'Search' }))
    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
  })

  it('opens Rewind from its tab', async () => {
    await renderApp()
    const tabs = screen.getByRole('navigation', { name: 'Main' })
    await userEvent.click(within(tabs).getByRole('button', { name: 'Rewind' }))
    expect(await screen.findByRole('heading', { name: 'Rewind' })).toBeInTheDocument()
    expect(within(tabs).getByRole('button', { name: 'Rewind' })).toHaveAttribute('aria-current', 'page')
    expect(window.location.hash).toBe('#/rewind')
  })
})

describe('App - Mark as watched sheet', () => {
  const film = (id: number, title: string) =>
    ({ tmdbId: id, title, year: 1998, posterPath: null, tomatometer: null, popcornmeter: null })

  async function openSheetForRushmore() {
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /mark rushmore as watched/i }))
    return screen.findByRole('dialog', { name: 'Mark as watched' })
  }

  it('asks when for a film with no history, and logs nothing until a row is picked', async () => {
    await renderApp()
    const sheet = await openSheetForRushmore()

    expect(within(sheet).getByText('Rushmore')).toBeInTheDocument()
    expect(within(sheet).getByRole('radio', { name: 'Tonight' })).toHaveAccessibleDescription(/today's date/i)
    expect(within(sheet).getByRole('radio', { name: 'Some time ago' })).toHaveAccessibleDescription(/no date/i)
    expect(getHistory()).toHaveLength(0)
    expect(getSeenBefore()).toHaveLength(0)
  })

  it('closes with no change on Cancel, the scrim and Escape', async () => {
    await renderApp()
    await openSheetForRushmore()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /mark rushmore as watched/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Close Mark as watched' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /mark rushmore as watched/i }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    expect(getHistory()).toHaveLength(0)
    expect(getSeenBefore()).toHaveLength(0)
  })

  it('Tonight logs a dated movie night and closes the sheet', async () => {
    await renderApp()
    await openSheetForRushmore()
    await chooseWhen('Tonight')

    await waitFor(() => expect(getHistory()).toHaveLength(1))
    expect(getSeenBefore()).toHaveLength(0)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Some time ago saves an undated "Seen before" entry and offers Undo', async () => {
    await renderApp()
    await openSheetForRushmore()
    await chooseWhen('Some time ago')

    await waitFor(() => expect(getSeenBefore()).toHaveLength(1))
    expect(getHistory()).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('Marked Rushmore as seen before')

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(getSeenBefore()).toHaveLength(0))
    // Back to a film with no history: ✓ asks again.
    await userEvent.click(screen.getByRole('button', { name: /mark rushmore as watched/i }))
    expect(await screen.findByRole('dialog', { name: 'Mark as watched' })).toBeInTheDocument()
  })

  it('a ✓ after "Some time ago" in the same session undoes it, with no sheet', async () => {
    await renderApp()
    await openSheetForRushmore()
    await chooseWhen('Some time ago')
    await waitFor(() => expect(getSeenBefore()).toHaveLength(1))

    await userEvent.click(await screen.findByRole('button', { name: /undo watched for rushmore/i }))
    await waitFor(() => expect(getSeenBefore()).toHaveLength(0))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('skips the sheet for a film already in history and logs another watch tonight, as before', async () => {
    resetStoreForTests({
      ...emptyStore(),
      history: [{ watchedAt: '2026-02-01T00:00:00.000Z', movie: film(1585, 'Rushmore'), discoveredVia: null }],
    })
    await renderApp()
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /undo watched for rushmore/i }))

    await waitFor(() => expect(getHistory()).toHaveLength(2))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('also skips the sheet for a film that is only in Seen before', async () => {
    resetStoreForTests({
      ...emptyStore(),
      history: [{ watchedAt: null, movie: film(1585, 'Rushmore'), discoveredVia: null }],
    })
    await renderApp()
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /undo watched for rushmore/i }))

    await waitFor(() => expect(getHistory()).toHaveLength(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Some time ago takes a listed film off the watchlist, and Undo puts it back as it was', async () => {
    resetStoreForTests({
      ...emptyStore(),
      watchlist: [{ addedAt: '2026-01-01T00:00:00.000Z', profileId: 'laura', movie: film(1585, 'Rushmore') }],
    })
    await renderApp('laura')
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /mark rushmore as watched/i }))
    await chooseWhen('Some time ago')
    await waitFor(() => expect(getSeenBefore()).toHaveLength(1))
    expect(getStoreSnapshot().watchlist).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(getSeenBefore()).toHaveLength(0))
    await waitFor(() => expect(getStoreSnapshot().watchlist).toHaveLength(1))
    expect(getStoreSnapshot().watchlist[0]).toMatchObject({ addedAt: '2026-01-01T00:00:00.000Z', profileId: 'laura' })
  })

  it('reverts and says so when saving "Some time ago" fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/store') && init?.method === 'POST') throw new Error('offline')
      if (String(url).startsWith('/api/store')) return { ok: true, status: 200, json: async () => emptyStore() }
      return { ok: true, status: 200, json: async () => rushmoreSearchResults }
    }))
    await renderApp()
    await openSheetForRushmore()
    await chooseWhen('Some time ago')

    expect(await screen.findByText(/couldn't save/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark rushmore as watched/i })).toHaveAttribute('aria-pressed', 'false')
    expect(getSeenBefore()).toHaveLength(0)
  })

  it('Up next on the homescreen asks when too, and a ✓ on a listed film uses the same sheet', async () => {
    sessionStorage.clear()
    resetStoreForTests({
      ...emptyStore(),
      watchlist: [{ addedAt: '2026-01-01T00:00:00.000Z', profileId: 'laura', movie: film(7, 'Heat') }],
    })
    await renderApp()
    await userEvent.click(within(screen.getByRole('region', { name: 'Up next' })).getByRole('button', { name: /mark heat as watched/i }))
    await chooseWhen('Some time ago')

    await waitFor(() => expect(getSeenBefore().map((e) => e.movie.title)).toEqual(['Heat']))
    expect(getStoreSnapshot().watchlist).toHaveLength(0)
  })
})

describe('App - Log a film', () => {
  async function openLogFilm() {
    await renderApp()
    await userEvent.click(screen.getByRole('button', { name: /^history$/i }))
    await userEvent.click(await screen.findByRole('button', { name: '+ Add a film' }))
  }

  it('opens from History and shows search without the home sections', async () => {
    sessionStorage.clear()
    await openLogFilm()

    expect(window.location.hash).toBe('#/history/log')
    expect(await screen.findByRole('heading', { name: 'Log a film' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'Search for a film')
    expect(screen.getByText(/type a title to find a film/i)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^history$/i })).toHaveAttribute('aria-current', 'page')
  })

  it('logs a film that is on no list: search, ✓, Some time ago', async () => {
    sessionStorage.clear()
    await openLogFilm()
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /mark rushmore as watched/i }))
    await chooseWhen('Some time ago')

    await waitFor(() => expect(getSeenBefore().map((e) => e.movie.title)).toEqual(['Rushmore']))
    expect(screen.getByRole('status')).toHaveTextContent('Marked Rushmore as seen before')
  })

  it('does not share a query with the Search tab', async () => {
    sessionStorage.clear()
    await renderApp()
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')
    await userEvent.click(screen.getByRole('button', { name: /^history$/i }))
    await userEvent.click(await screen.findByRole('button', { name: '+ Add a film' }))

    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('reopens from its link', async () => {
    window.location.hash = '#/history/log'
    await renderApp()
    expect(await screen.findByRole('heading', { name: 'Log a film' })).toBeInTheDocument()
  })
})
