import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { OptionSheet } from './OptionSheet'
import { MovieCard } from './MovieCard'

function Harness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Sort</button>
      {open && (
        <OptionSheet
          title="Sort by"
          options={[{ value: 'a', label: 'Newest added' }, { value: 'b', label: 'Title A–Z' }]}
          selected="a"
          onSelect={vi.fn()}
          onClose={() => { onClose(); setOpen(false) }}
        />
      )}
    </>
  )
}

describe('sheets as modal dialogs', () => {
  it('moves focus into the sheet when it opens', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Sort' }))
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
  })

  it('keeps Tab and Shift+Tab inside the sheet', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Sort' }))
    const dialog = screen.getByRole('dialog')
    for (let i = 0; i < 6; i++) {
      await userEvent.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    for (let i = 0; i < 6; i++) {
      await userEvent.tab({ shift: true })
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
  })

  it('closes on Escape and returns focus to what opened it', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Sort' })
    await userEvent.click(opener)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})

describe('score labels', () => {
  it('gives each score a spoken name and hides the emoji from screen readers', () => {
    render(
      <MovieCard
        movie={{ tmdbId: 1, title: 'Heat', year: 1995, posterPath: null, popularity: 1, tomatometer: 84, popcornmeter: 83, availability: { streaming: [], rent: [] }, overview: null }}
        onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={false}
      />,
    )
    const critic = screen.getByTitle('Critic score')
    expect(critic).toHaveTextContent('critic score')
    expect(critic.querySelector('[aria-hidden="true"]')).toHaveTextContent('🍅')
    expect(screen.getByTitle('IMDb user rating')).toHaveTextContent('audience score')
  })
})
