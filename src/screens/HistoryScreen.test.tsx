import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HistoryScreen } from './HistoryScreen'
import { logWatch } from '../data/history'
import type { Movie } from '../types'

const movie = (tmdbId: number, title: string): Movie => ({
  tmdbId, title, year: 1998, posterPath: null, popularity: 10,
  tomatometer: 90, availability: { streaming: [], rent: [] },
})

const via = {
  fromMovie: { tmdbId: 153, title: 'Lost in Translation' },
  viaActor: { tmdbId: 1532, name: 'Bill Murray' },
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-08T20:00:00Z'))
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

  it('lists watched films newest first', () => {
    logWatch(movie(1, 'Older'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    logWatch(movie(2, 'Newer'), null)

    render(<HistoryScreen />)
    const titles = screen.getAllByTestId('history-title').map((n) => n.textContent)
    expect(titles).toEqual(['Newer', 'Older'])
  })

  it('shows the discovery path', () => {
    logWatch(movie(1585, 'Rushmore'), via)
    render(<HistoryScreen />)
    expect(screen.getByText(/via bill murray, from lost in translation/i)).toBeInTheDocument()
  })

  it('omits the path for a directly searched film', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    render(<HistoryScreen />)
    expect(screen.queryByText(/via /i)).not.toBeInTheDocument()
  })

  it('collapses repeat watches of the same film into one row with a count', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    logWatch(movie(1585, 'Rushmore'), null)

    render(<HistoryScreen />)
    expect(screen.getAllByTestId('history-title')).toHaveLength(1)
    expect(screen.getByText('watched 2×')).toBeInTheDocument()
  })

  it('keeps the most recent date and discovery path for a collapsed group', () => {
    logWatch(movie(1585, 'Rushmore'), via)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    logWatch(movie(1585, 'Rushmore'), null)

    render(<HistoryScreen />)
    expect(screen.getByText('9/1/2026')).toBeInTheDocument()
    // The most recent watch had no discovery path, so none should show —
    // even though the earlier watch of the same film had one.
    expect(screen.queryByText(/via /i)).not.toBeInTheDocument()
  })

  it('does not collapse watches of different films', () => {
    logWatch(movie(1, 'Older'), null)
    logWatch(movie(2, 'Newer'), null)

    render(<HistoryScreen />)
    expect(screen.getAllByTestId('history-title')).toHaveLength(2)
    expect(screen.queryByText(/watched \d+×/)).not.toBeInTheDocument()
  })

  it('offers a JSON export', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    render(<HistoryScreen />)
    expect(screen.getByRole('button', { name: /download json/i })).toBeInTheDocument()
  })

  it('creates a Blob URL and defers revocation past the click', () => {
    logWatch(movie(1585, 'Rushmore'), null)
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
})
