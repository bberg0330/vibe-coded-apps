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
})
