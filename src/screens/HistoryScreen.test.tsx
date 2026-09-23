import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HistoryScreen } from './HistoryScreen'
import { logWatch } from '../data/history'
import { startWatching, cancelWatching, WATCHING_WINDOW_MS } from '../data/watching'
import { resetStoreForTests, getStoreSnapshot } from '../data/store'
import { applyOp } from '../../vite-plugins/store-ops'
import type { Movie, StoreOp } from '../types'

const movie = (tmdbId: number, title: string): Movie => ({
  tmdbId, title, year: 1998, posterPath: null, popularity: 10,
  tomatometer: 90, popcornmeter: null, availability: { streaming: [], rent: [] },
  overview: null,
})

const via = {
  fromMovie: { tmdbId: 153, title: 'Lost in Translation' },
  viaActor: { tmdbId: 1532, name: 'Bill Murray' },
}

/** A fake server: applies the op to the current snapshot and echoes it back. */
function stubStoreServer() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    const op = JSON.parse(String(init?.body)) as StoreOp
    const next = applyOp(getStoreSnapshot(), op)
    return { ok: true, status: 200, json: async () => next }
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-08T20:00:00Z'))
  resetStoreForTests()
  stubStoreServer()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('HistoryScreen', () => {
  it('invites a first entry when empty', () => {
    render(<HistoryScreen />)
    expect(screen.getByText(/nothing logged yet/i)).toBeInTheDocument()
  })

  it('lists watched films newest first', async () => {
    await logWatch(movie(1, 'Older'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    await logWatch(movie(2, 'Newer'), null)

    render(<HistoryScreen />)
    const titles = screen.getAllByTestId('history-title').map((n) => n.textContent)
    expect(titles).toEqual(['Newer', 'Older'])
  })

  it('shows the discovery path', async () => {
    await logWatch(movie(1585, 'Rushmore'), via)
    render(<HistoryScreen />)
    expect(screen.getByText(/via bill murray, from lost in translation/i)).toBeInTheDocument()
  })

  it('omits the path for a directly searched film', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    render(<HistoryScreen />)
    expect(screen.queryByText(/via /i)).not.toBeInTheDocument()
  })

  it('collapses repeat watches of the same film into one row with a count', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    await logWatch(movie(1585, 'Rushmore'), null)

    render(<HistoryScreen />)
    expect(screen.getAllByTestId('history-title')).toHaveLength(1)
    expect(screen.getByText('watched 2×')).toBeInTheDocument()
  })

  it('keeps the most recent date and discovery path for a collapsed group', async () => {
    await logWatch(movie(1585, 'Rushmore'), via)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    await logWatch(movie(1585, 'Rushmore'), null)

    render(<HistoryScreen />)
    expect(screen.getByText('9/1/2026')).toBeInTheDocument()
    // The most recent watch had no discovery path, so none should show —
    // even though the earlier watch of the same film had one.
    expect(screen.queryByText(/via /i)).not.toBeInTheDocument()
  })

  it('does not collapse watches of different films', async () => {
    await logWatch(movie(1, 'Older'), null)
    await logWatch(movie(2, 'Newer'), null)

    render(<HistoryScreen />)
    expect(screen.getAllByTestId('history-title')).toHaveLength(2)
    expect(screen.queryByText(/watched \d+×/)).not.toBeInTheDocument()
  })

  it('navigates to the movie when a history row is tapped', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    const onOpenMovie = vi.fn()
    render(<HistoryScreen onOpenMovie={onOpenMovie} />)

    fireEvent.click(screen.getByTestId('history-title'))
    expect(onOpenMovie).toHaveBeenCalledWith(
      expect.objectContaining({ tmdbId: 1585, title: 'Rushmore' }),
    )
  })

  it('offers a JSON export', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    render(<HistoryScreen />)
    expect(screen.getByRole('button', { name: /download json/i })).toBeInTheDocument()
  })

  it('creates a Blob URL and defers revocation past the click', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    render(<HistoryScreen />)

    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    // jsdom has no real navigation; stub the anchor's click so it doesn't
    // log an unimplemented-navigation error when we simulate the download.
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    fireEvent.click(screen.getByRole('button', { name: /download json/i }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(anchorClick).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.runAllTimers()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  describe('Tonight section', () => {
    it('shows a still-in-progress entry tagged "Watching"', async () => {
      await startWatching(movie(1585, 'Rushmore'), 'laura', null)
      render(<HistoryScreen />)

      expect(screen.getByText('Tonight')).toBeInTheDocument()
      expect(screen.getByTestId('tonight-title')).toHaveTextContent('Rushmore')
      expect(screen.getByTestId('tonight-status')).toHaveTextContent('Watching')
    })

    it(
      'keeps showing an entry tagged "Watched" once its 12h window has elapsed, ' +
      'since nowWatching entries are never migrated into history',
      async () => {
        await startWatching(movie(1585, 'Rushmore'), 'laura', null)
        vi.setSystemTime(new Date(Date.now() + WATCHING_WINDOW_MS))

        render(<HistoryScreen />)

        expect(screen.getByTestId('tonight-title')).toHaveTextContent('Rushmore')
        expect(screen.getByTestId('tonight-status')).toHaveTextContent('Watched')
      },
    )

    it('lists entries newest startedAt first, across every profile', async () => {
      await startWatching(movie(1, 'Older'), 'laura', null)
      vi.setSystemTime(new Date('2026-08-08T21:00:00Z'))
      await startWatching(movie(2, 'Newer'), 'brian', null)

      render(<HistoryScreen />)
      const titles = screen.getAllByTestId('tonight-title').map((n) => n.textContent)
      expect(titles).toEqual(['Newer', 'Older'])
    })

    it('opens the movie when a Tonight row is tapped', async () => {
      await startWatching(movie(1585, 'Rushmore'), 'laura', null)
      const onOpenMovie = vi.fn()
      render(<HistoryScreen onOpenMovie={onOpenMovie} />)

      fireEvent.click(screen.getByTestId('tonight-title'))
      expect(onOpenMovie).toHaveBeenCalledWith(
        expect.objectContaining({ tmdbId: 1585, title: 'Rushmore' }),
      )
    })

    it('does not render a Tonight section when nothing has been started', () => {
      render(<HistoryScreen />)
      expect(screen.queryByText('Tonight')).not.toBeInTheDocument()
    })

    it('shows the Tonight section even when permanent history is empty', async () => {
      await startWatching(movie(1585, 'Rushmore'), 'laura', null)
      render(<HistoryScreen />)

      expect(screen.getByText('Tonight')).toBeInTheDocument()
      expect(screen.getByText(/nothing logged yet/i)).toBeInTheDocument()
    })

    it('does not render a cancel control when onCancelWatching is omitted', async () => {
      await startWatching(movie(1585, 'Rushmore'), 'laura', null)
      render(<HistoryScreen />)

      expect(screen.queryByRole('button', { name: /undo watching/i })).not.toBeInTheDocument()
    })

    it('calls onCancelWatching with the tapped entry', async () => {
      await startWatching(movie(1585, 'Rushmore'), 'laura', null)
      const onCancelWatching = vi.fn()
      render(<HistoryScreen onCancelWatching={onCancelWatching} />)

      fireEvent.click(screen.getByRole('button', { name: /undo watching rushmore tonight/i }))
      expect(onCancelWatching).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: 'laura', movie: expect.objectContaining({ tmdbId: 1585 }) }),
      )
    })

    it('hides an optimistically-cancelled row even before the store write lands', async () => {
      await startWatching(movie(1585, 'Rushmore'), 'laura', null)
      render(
        <HistoryScreen
          onCancelWatching={vi.fn()}
          optimisticallyCancelled={new Set(['laura:1585'])}
        />,
      )

      expect(screen.queryByTestId('tonight-title')).not.toBeInTheDocument()
    })

    it('disables the cancel button for a key marked as cancelling', async () => {
      await startWatching(movie(1585, 'Rushmore'), 'laura', null)
      render(
        <HistoryScreen
          onCancelWatching={vi.fn()}
          cancellingKeys={new Set(['laura:1585'])}
        />,
      )

      expect(screen.getByRole('button', { name: /undo watching rushmore tonight/i })).toBeDisabled()
    })

    it('actually removes the entry from the store when cancelWatching resolves', async () => {
      await startWatching(movie(1585, 'Rushmore'), 'laura', null)
      await cancelWatching('laura', 1585)

      render(<HistoryScreen />)
      expect(screen.queryByTestId('tonight-title')).not.toBeInTheDocument()
    })
  })
})
