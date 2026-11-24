import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Toast } from './Toast'

describe('Toast', () => {
  it('holds while hovered or focused, and releases only when both have left', () => {
    const onHold = vi.fn()
    render(<Toast message="Removed Heat" onUndo={() => {}} onHold={onHold} />)
    const toast = screen.getByRole('status')
    fireEvent.pointerEnter(toast)
    fireEvent.focus(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.pointerLeave(toast)
    expect(onHold).toHaveBeenLastCalledWith(true) // still focused
    fireEvent.blur(screen.getByRole('button', { name: 'Undo' }))
    expect(onHold).toHaveBeenLastCalledWith(false)
  })

  it('shows the Undo label by default and the caller\'s label when it gives one', () => {
    const { rerender } = render(<Toast message="Removed Heat" onUndo={() => {}} />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()

    rerender(<Toast message="Logged Heat for tonight" actionLabel="Not tonight?" onUndo={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not tonight?' })).toBeInTheDocument()
  })

  it('calls onUndo from whatever the button says', () => {
    const onUndo = vi.fn()
    render(<Toast message="Logged Heat for tonight" actionLabel="Not tonight?" onUndo={onUndo} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not tonight?' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })
})
