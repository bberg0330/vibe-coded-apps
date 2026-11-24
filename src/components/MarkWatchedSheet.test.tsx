import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkWatchedSheet } from './MarkWatchedSheet'
import type { Movie } from '../types'

const movie = (over: Partial<Movie> = {}): Movie => ({
  tmdbId: 949, title: 'Heat', year: 1995, posterPath: '/heat.jpg', popularity: 50,
  tomatometer: 84, popcornmeter: 83, availability: { streaming: [], rent: [] }, overview: null, ...over,
})

function setup(m: Movie = movie()) {
  const handlers = { onTonight: vi.fn(), onEarlier: vi.fn(), onClose: vi.fn() }
  render(<MarkWatchedSheet movie={m} {...handlers} />)
  return handlers
}

describe('MarkWatchedSheet', () => {
  it('is a modal dialog naming the film and offering Tonight and Some time ago', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Mark as watched' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('Heat')).toBeInTheDocument()
    expect(within(dialog).getByText('1995')).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Tonight' })).toHaveAccessibleDescription("Goes in History with today's date")
    expect(within(dialog).getByRole('radio', { name: 'Some time ago' })).toHaveAccessibleDescription('Goes in Seen before, with no date')
  })

  it('leaves out the year when the film has none, and falls back to an empty poster', () => {
    setup(movie({ year: null, posterPath: null }))
    expect(screen.queryByText('1995')).not.toBeInTheDocument()
    expect(document.querySelector('.mark-sheet-film .poster-empty')).not.toBeNull()
  })

  it('applies the tapped row without also closing it by itself (the parent decides)', async () => {
    const { onTonight, onEarlier, onClose } = setup()
    await userEvent.click(screen.getByRole('radio', { name: 'Some time ago' }))
    expect(onEarlier).toHaveBeenCalledTimes(1)
    expect(onTonight).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('radio', { name: 'Tonight' }))
    expect(onTonight).toHaveBeenCalledTimes(1)
  })

  it('closes on Cancel, the scrim and Escape', async () => {
    const { onClose } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close Mark as watched' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('gives Cancel the 44px tap-target class', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('tap-target')
  })
})
