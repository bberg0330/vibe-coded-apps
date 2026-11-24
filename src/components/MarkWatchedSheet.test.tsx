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
  it('is a modal dialog that asks the question, names the film and offers Tonight and Some time ago', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'When did you watch it?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('heading', { name: 'When did you watch it?' })).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: 'Close When did you watch it?' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('gives Cancel the 44px tap-target class', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('tap-target')
  })

  it('ticks Tonight when it is opened from "Not tonight?" (the watch is already logged as tonight)', () => {
    render(<MarkWatchedSheet movie={movie()} tonightTicked onTonight={() => {}} onEarlier={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Tonight' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Some time ago' })).toHaveAttribute('aria-checked', 'false')
  })

  it('has nothing ticked when it asks about a film with no history', () => {
    setup()
    expect(screen.getByRole('radio', { name: 'Tonight' })).toHaveAttribute('aria-checked', 'false')
  })
})
