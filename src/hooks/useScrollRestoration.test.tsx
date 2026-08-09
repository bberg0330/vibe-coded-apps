import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useScrollRestoration } from './useScrollRestoration'

function TestComponent({ routeKey, ready }: { routeKey: string; ready: boolean }) {
  useScrollRestoration(routeKey, ready)
  return <div style={{ height: '3000px' }}>content</div>
}

beforeEach(() => {
  sessionStorage.clear()
  // Mock window.scrollTo and scrollY
  let currentScrollY = 0
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    get: () => currentScrollY,
  })
  window.scrollTo = vi.fn((x: number, y: number) => {
    currentScrollY = y
  }) as unknown as typeof window.scrollTo
})

describe('useScrollRestoration', () => {
  it('restores a saved scroll position once ready', () => {
    sessionStorage.setItem('mn.scroll:movie/153', '400')
    render(<TestComponent routeKey="movie/153" ready />)
    expect(window.scrollY).toBe(400)
  })

  it('does not restore anything while not ready', () => {
    sessionStorage.setItem('mn.scroll:movie/153', '400')
    render(<TestComponent routeKey="movie/153" ready={false} />)
    expect(window.scrollY).toBe(0)
  })

  it('does nothing when there is no saved position', () => {
    render(<TestComponent routeKey="movie/999" ready />)
    expect(window.scrollY).toBe(0)
  })

  it('saves the current scroll position on unmount', () => {
    const { unmount } = render(<TestComponent routeKey="movie/153" ready />)
    window.scrollTo(0, 777)

    unmount()

    expect(sessionStorage.getItem('mn.scroll:movie/153')).toBe('777')
  })

  it('keeps separate saved positions for different route keys', () => {
    const first = render(<TestComponent routeKey="movie/1" ready />)
    window.scrollTo(0, 111)
    first.unmount()

    const second = render(<TestComponent routeKey="movie/2" ready />)
    window.scrollTo(0, 222)
    second.unmount()

    expect(sessionStorage.getItem('mn.scroll:movie/1')).toBe('111')
    expect(sessionStorage.getItem('mn.scroll:movie/2')).toBe('222')
  })

  it('saves the current scroll position on pagehide, without unmounting', () => {
    render(<TestComponent routeKey="movie/153" ready />)
    window.scrollTo(0, 500)

    window.dispatchEvent(new Event('pagehide'))

    expect(sessionStorage.getItem('mn.scroll:movie/153')).toBe('500')
  })

  it('saves the current scroll position when visibility becomes hidden', () => {
    render(<TestComponent routeKey="movie/153" ready />)
    window.scrollTo(0, 600)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(sessionStorage.getItem('mn.scroll:movie/153')).toBe('600')
  })

  it('removes its listeners on unmount so a stale instance cannot overwrite a later screen', () => {
    const { unmount } = render(<TestComponent routeKey="movie/153" ready />)
    window.scrollTo(0, 300)

    unmount()
    expect(sessionStorage.getItem('mn.scroll:movie/153')).toBe('300')

    // A different screen now owns this route key's storage.
    sessionStorage.setItem('mn.scroll:movie/153', '999')
    window.scrollTo(0, 123)

    // If the unmounted hook's pagehide listener were still attached, it
    // would overwrite the storage with the stale scrollY of 123.
    window.dispatchEvent(new Event('pagehide'))

    expect(sessionStorage.getItem('mn.scroll:movie/153')).toBe('999')
  })
})
