import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileGate } from './ProfileGate'
import type { Profile } from '../data/profiles'

const profiles: Profile[] = [
  { id: 'laura', name: 'Laura' },
  { id: 'brian', name: 'Brian' },
]

describe('ProfileGate', () => {
  it('renders a radio option per profile and a disabled Continue button', () => {
    render(<ProfileGate profiles={profiles} onSelect={vi.fn()} />)

    for (const profile of profiles) {
      expect(screen.getByRole('radio', { name: profile.name })).toHaveAttribute('aria-checked', 'false')
    }
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  })

  it('does not call onSelect when Continue is tapped with nothing picked', async () => {
    const onSelect = vi.fn()
    render(<ProfileGate profiles={profiles} onSelect={onSelect} />)

    // A disabled button ignores clicks at the browser level, but assert the
    // handler contract directly too, independent of that native behaviour.
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('stages a tapped profile without calling onSelect until Continue is pressed', async () => {
    const onSelect = vi.fn()
    render(<ProfileGate profiles={profiles} onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Laura' }))

    expect(screen.getByRole('radio', { name: 'Laura' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Brian' })).toHaveAttribute('aria-checked', 'false')
    expect(onSelect).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onSelect).toHaveBeenCalledWith('laura')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('re-tapping a different profile before Continue switches the staged choice', async () => {
    const onSelect = vi.fn()
    render(<ProfileGate profiles={profiles} onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Laura' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Brian' }))

    expect(screen.getByRole('radio', { name: 'Laura' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Brian' })).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onSelect).toHaveBeenCalledWith('brian')
  })
})
