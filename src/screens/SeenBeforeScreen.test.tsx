import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SeenBeforeScreen, groupByYear } from './SeenBeforeScreen'
import { getSeenBefore } from '../data/history'
import type { WatchEntry } from '../types'

vi.mock('../data/history', () => ({ getSeenBefore: vi.fn() }))

const seen = (tmdbId: number, title: string, year: number | null): WatchEntry => ({
  watchedAt: null, discoveredVia: null,
  movie: { tmdbId, title, year, posterPath: null, tomatometer: null, popcornmeter: null },
})

const props = { onUnmark: vi.fn(), onAddDate: vi.fn() }

beforeEach(() => vi.clearAllMocks())

describe('groupByYear', () => {
  it('puts the newest year first, unknown years last, titles A–Z', () => {
    const groups = groupByYear([seen(1, 'Barbie', 2023), seen(2, 'Heat', null), seen(3, 'Parasite', 2019), seen(4, 'Arrival', 2023)])
    expect(groups.map((g) => [g.year, g.entries.map((e) => e.movie.title)])).toEqual([
      [2023, ['Arrival', 'Barbie']], [2019, ['Parasite']], [null, ['Heat']],
    ])
  })
})

describe('SeenBeforeScreen', () => {
  it('collapses a year with more than 5 films until tapped', async () => {
    vi.mocked(getSeenBefore).mockReturnValue([
      seen(1, 'Parasite', 2019),
      ...Array.from({ length: 6 }, (_, i) => seen(10 + i, `Film ${i}`, 1999)),
    ])
    render(<SeenBeforeScreen {...props} />)

    expect(screen.getByText('7 films · grouped by release year')).toBeInTheDocument()
    expect(screen.getByText('Parasite')).toBeInTheDocument()
    const y1999 = screen.getByRole('region', { name: '1999' })
    expect(within(y1999).queryByText('Film 0')).not.toBeInTheDocument()

    await userEvent.click(within(y1999).getByRole('button', { name: /6 films ›/ }))
    expect(within(y1999).getByText('Film 0')).toBeInTheDocument()
  })

  it('unmarks from the ⋯ menu', async () => {
    const parasite = seen(1, 'Parasite', 2019)
    vi.mocked(getSeenBefore).mockReturnValue([parasite])
    render(<SeenBeforeScreen {...props} />)

    await userEvent.click(screen.getByRole('button', { name: 'Menu for Parasite' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unmark' }))
    expect(props.onUnmark).toHaveBeenCalledWith(parasite)
  })

  it('adds a date from the ⋯ menu', async () => {
    const parasite = seen(1, 'Parasite', 2019)
    vi.mocked(getSeenBefore).mockReturnValue([parasite])
    render(<SeenBeforeScreen {...props} />)

    await userEvent.click(screen.getByRole('button', { name: 'Menu for Parasite' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add a date' }))
    await userEvent.type(screen.getByLabelText('Date you watched Parasite'), '2020-02-14')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onAddDate).toHaveBeenCalledWith(parasite, '2020-02-14')
  })
})
