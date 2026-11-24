import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { YearTile } from './YearTile'

describe('YearTile', () => {
  it('shows progress and opens the year', async () => {
    const onOpen = vi.fn()
    const { container } = render(<YearTile year={2019} watched={7} total={50} onOpen={onOpen} />)
    expect(screen.getByText('7 of 50 watched')).toBeInTheDocument()
    expect(container.querySelector('.progress-fill')).toHaveStyle({ width: '14%' })
    await userEvent.click(screen.getByRole('button', { name: 'Rewind 2019, 7 of 50 watched' }))
    expect(onOpen).toHaveBeenCalled()
  })
})
