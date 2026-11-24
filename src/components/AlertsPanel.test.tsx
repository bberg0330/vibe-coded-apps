import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AlertsPanel } from './AlertsPanel'

const a = (id: number, title: string) => ({ id, tmdbId: id * 10, title, posterPath: null, where: 'Stream · Netflix', createdAt: '' })

describe('AlertsPanel', () => {
  const props = () => ({
    onClose: vi.fn(), onOpen: vi.fn(), onWatchTonight: vi.fn(), onDismiss: vi.fn(), onClearAll: vi.fn(), isPending: () => false,
  })

  it('lists alerts with where to watch, and routes each action', async () => {
    const p = props()
    render(<AlertsPanel alerts={[a(1, 'Past Lives'), a(2, 'Heat')]} {...p} />)

    expect(screen.getByRole('heading', { name: 'Now watchable' })).toBeInTheDocument()
    expect(screen.getAllByText('Stream · Netflix')).toHaveLength(2)
    await userEvent.click(screen.getAllByRole('button', { name: 'Watch tonight' })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Heat' }))
    await userEvent.click(screen.getByRole('button', { name: 'Past Lives' }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(p.onWatchTonight).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    expect(p.onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    expect(p.onClearAll).toHaveBeenCalled()
  })

  it('says when there is nothing new, without Clear all, and closes on Escape', async () => {
    const p = props()
    render(<AlertsPanel alerts={[]} {...p} />)
    expect(screen.getByText(/Nothing new/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(p.onClose).toHaveBeenCalled()
  })
})
