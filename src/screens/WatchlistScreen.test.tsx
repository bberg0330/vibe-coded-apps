import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WatchlistScreen } from './WatchlistScreen'
import { resetStoreForTests } from '../data/store'
import { PROFILES } from '../data/profiles'
import { emptyStore } from '../types'
import type { WatchlistEntry } from '../types'

vi.mock('../api/tmdb', () => ({
  posterUrl: () => null,
  getWatchProviders: vi.fn(async (id: number) => ({ streaming: id === 1 ? ['netflix'] : ['hbomax'], rent: [] })),
  getMovieGenres: vi.fn(async (id: number) => (id === 2 ? ['Comedy'] : ['Drama'])),
}))

const entry = (tmdbId: number, title: string, profileId: string, critic: number | null): WatchlistEntry => ({
  addedAt: `2026-01-0${tmdbId}T00:00:00.000Z`,
  profileId,
  movie: { tmdbId, title, year: 2000 + tmdbId, posterPath: null, tomatometer: critic, popcornmeter: null },
})
// Newest first.
const entries = [entry(3, 'Gamma', 'brian', 60), entry(2, 'Beta', 'laura', null), entry(1, 'Alpha', 'laura', 90)]
const titles = () => screen.queryAllByTestId('watchlist-title').map((n) => n.textContent)

function renderScreen(list = entries) {
  return render(
    <WatchlistScreen
      entries={list}
      profiles={PROFILES}
      profileName={(id) => PROFILES.find((p) => p.id === id)?.name ?? id}
      onMarkWatched={() => {}}
      onRemove={() => {}}
    />,
  )
}

beforeEach(() => {
  localStorage.clear()
  resetStoreForTests({ ...emptyStore(), enabledServices: ['netflix'] })
})

describe('WatchlistScreen sort & filter', () => {
  it('starts on Newest added with every film and a plain count', () => {
    renderScreen()
    expect(titles()).toEqual(['Gamma', 'Beta', 'Alpha'])
    expect(screen.getByText('3 films')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sort: Newest added' })).toBeInTheDocument()
  })

  it('sorts from the Sort by sheet, which closes on pick', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Sort: Newest added' }))
    const sheet = screen.getByRole('dialog', { name: 'Sort by' })
    expect(within(sheet).getByRole('radio', { name: /Newest added/ })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(sheet).getByRole('radio', { name: /Critic score/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(titles()).toEqual(['Alpha', 'Gamma', 'Beta'])
  })

  it('filters by who added it, shows "N of M", and clears', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Brian' }))
    expect(titles()).toEqual(['Gamma'])
    expect(screen.getByText(/1 of 3 films/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(titles()).toEqual(['Gamma', 'Beta', 'Alpha'])
  })

  it('filters to films on our services once availability arrives', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'On our services' }))
    await waitFor(() => expect(titles()).toEqual(['Alpha']))
  })

  it('picks one genre from the Genre sheet, listing genres with counts', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Genre ▾' }))
    const sheet = screen.getByRole('dialog', { name: 'Genre' })
    await waitFor(() => expect(within(sheet).getByRole('radio', { name: /Drama · 2/ })).toBeInTheDocument())
    await userEvent.click(within(sheet).getByRole('radio', { name: /Comedy · 1/ }))
    expect(titles()).toEqual(['Beta'])
    expect(screen.getByRole('button', { name: 'Comedy ▾' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('hides films without a critic score', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Has critic score' }))
    expect(titles()).toEqual(['Gamma', 'Alpha'])
  })

  it('says so when nothing matches', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Brian' }))
    await userEvent.click(screen.getByRole('button', { name: 'Has critic score' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sort: Newest added' }))
    await userEvent.click(screen.getByRole('radio', { name: /Title/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Laura' }))
    await userEvent.click(screen.getByRole('button', { name: 'Genre ▾' }))
    await waitFor(() => screen.getByRole('radio', { name: /Comedy/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Comedy/ }))
    expect(titles()).toEqual([])
    expect(screen.getByText('No films match these filters.')).toBeInTheDocument()
  })

  it('remembers the view on this device', async () => {
    const { unmount } = renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Brian' }))
    unmount()
    renderScreen()
    expect(screen.getByRole('button', { name: 'Brian' })).toHaveAttribute('aria-pressed', 'true')
    expect(titles()).toEqual(['Gamma'])
  })

  it('shows the empty state, without controls, when the list is empty', () => {
    renderScreen([])
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Filter' })).not.toBeInTheDocument()
  })
})
