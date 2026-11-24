import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabBar } from './TabBar'

describe('TabBar', () => {
  it('shows every tab, marks the current one, and ignores taps on it', async () => {
    const onSelect = vi.fn()
    render(<TabBar current="rewind" onSelect={onSelect} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Search', 'Rewind', 'Watchlist', 'History'])
    expect(screen.getByRole('button', { name: 'Rewind' })).toHaveAttribute('aria-current', 'page')

    await userEvent.click(screen.getByRole('button', { name: 'Rewind' }))
    await userEvent.click(screen.getByRole('button', { name: 'History' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('history')
  })

  it('puts the alert dot on one tab only', () => {
    render(<TabBar current="search" alert="watchlist" onSelect={() => {}} />)
    expect(screen.getAllByTestId('alert-dot')).toHaveLength(1)
  })
})
