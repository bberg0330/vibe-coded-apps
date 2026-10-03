import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { AppIcon } from './AppIcon'

describe('AppIcon', () => {
  it('renders the icon as a decorative square image at the given size', () => {
    const { container } = render(<AppIcon size={48} />)
    const img = container.querySelector('img.app-icon')!
    expect(img.getAttribute('src')).toBeTruthy()
    expect(img).toHaveAttribute('width', '48')
    expect(img).toHaveAttribute('height', '48')
    expect(img).toHaveAttribute('alt', '')
  })

  it('defaults to 64px', () => {
    const { container } = render(<AppIcon />)
    expect(container.querySelector('img')).toHaveAttribute('width', '64')
  })
})
