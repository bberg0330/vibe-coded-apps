import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('offers a JSON export', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    render(<HistoryScreen />)
    expect(screen.getByRole('button', { name: /download json/i })).toBeInTheDocument()
  })
})
