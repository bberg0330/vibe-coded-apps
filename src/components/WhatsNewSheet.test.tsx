import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WhatsNewSheet } from './WhatsNewSheet'
import type { ReleaseNote } from '../data/releaseNotes'

const release: ReleaseNote = {
  id: 't', date: '2026-11-25', title: 'Now showing', subtitle: 'Two upgrades',
  rows: [
    { glyph: '✓', title: 'One-tap Tonight', body: 'Tap and done.' },
    { icon: 'bell', title: 'Alerts', body: 'Ding!' },
  ],
}

describe('WhatsNewSheet', () => {
  it('is a labelled dialog with the title, the dated subtitle and every row', () => {
    render(<WhatsNewSheet release={release} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Now showing' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('Two upgrades · 25 Nov')
    expect(screen.getByText('One-tap Tonight')).toBeInTheDocument()
    expect(screen.getByText('Ding!')).toBeInTheDocument()
  })

  it('closes from Got it, the scrim and Escape, and moves focus inside', async () => {
    const onClose = vi.fn()
    render(<WhatsNewSheet release={release} onClose={onClose} />)
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: "Close what's new", hidden: true }))
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
