import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SheetOption } from './SheetOption'

describe('SheetOption', () => {
  it('is a single-select radio showing its label, and a ✓ when selected', () => {
    const { rerender } = render(<SheetOption label="Critic score" selected={false} onSelect={() => {}} />)
    const row = screen.getByRole('radio', { name: 'Critic score' })
    expect(row).toHaveAttribute('aria-checked', 'false')
    expect(row).not.toHaveClass('has-description')
    expect(screen.queryByText('✓')).not.toBeInTheDocument()

    rerender(<SheetOption label="Critic score" selected onSelect={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Critic score' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('without a description, the name is the label and nothing extra is described', () => {
    render(<SheetOption label="Title A–Z" selected={false} onSelect={() => {}} />)
    expect(screen.getByRole('radio')).toHaveAccessibleName('Title A–Z')
    expect(screen.getByRole('radio')).not.toHaveAttribute('aria-describedby')
  })

  it('with a description, shows it on a second line but keeps the label as the accessible name', () => {
    render(<SheetOption label="Tonight" description="Goes in History with today's date" selected={false} onSelect={() => {}} />)
    const row = screen.getByRole('radio', { name: 'Tonight' })
    expect(row).toHaveClass('has-description')
    expect(row).toHaveAccessibleDescription("Goes in History with today's date")
    expect(screen.getByText("Goes in History with today's date")).toHaveClass('sheet-option-description')
  })

  it('calls onSelect when tapped', async () => {
    const onSelect = vi.fn()
    render(<SheetOption label="Tonight" selected={false} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Tonight' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
