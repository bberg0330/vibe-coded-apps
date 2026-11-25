import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HistoryMenu } from './HistoryMenu'

describe('HistoryMenu', () => {
  it('offers Move to Seen before above Delete, each calling its own handler', () => {
    const onMove = vi.fn()
    const onDelete = vi.fn()
    render(<HistoryMenu onMoveToSeenBefore={onMove} onDelete={onDelete} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Move to Seen before', 'Delete this watch'])

    fireEvent.click(buttons[0])
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()

    fireEvent.click(buttons[1])
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('leaves out Move to Seen before when nothing handles it', () => {
    render(<HistoryMenu onDelete={() => {}} />)
    expect(screen.queryByRole('button', { name: /move to seen before/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete this watch' })).toBeInTheDocument()
  })

  it('says Deleting… and disables only Delete while a delete is in flight', () => {
    render(<HistoryMenu onMoveToSeenBefore={() => {}} onDelete={() => {}} isDeleting />)
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /move to seen before/i })).toBeEnabled()
  })

  it('does not let a click reach the row underneath', () => {
    const onRow = vi.fn()
    render(
      <div onClick={onRow}>
        <HistoryMenu onMoveToSeenBefore={() => {}} onDelete={() => {}} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: /move to seen before/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete this watch' }))
    expect(onRow).not.toHaveBeenCalled()
  })

  it('keeps the markup the CSS styles: .history-menu, a .danger delete, decorative glyphs', () => {
    const { container } = render(<HistoryMenu onMoveToSeenBefore={() => {}} onDelete={() => {}} />)
    expect(container.querySelector('.history-menu')).not.toBeNull()
    expect(container.querySelectorAll('.history-menu > button')).toHaveLength(2)
    expect(container.querySelector('.history-menu > button.danger')?.textContent).toBe('Delete this watch')
    container.querySelectorAll('svg').forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'))
  })
})
