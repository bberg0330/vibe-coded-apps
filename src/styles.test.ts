// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

/** The declarations of every rule whose body sets `background: var(--accent)` (a gold FILL). */
function goldFillRules(): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const body = m[2]
    if (/background:\s*var\(--accent\)\s*[;}]?/.test(body) || /background:\s*var\(--accent\);/.test(body)) {
      rules.push({ selector: m[1].trim().split('\n').pop()!.trim(), body })
    }
  }
  return rules
}

describe('gold fills in light mode', () => {
  it('gives every gold-filled control or tag the edge, so its shape shows on a light surface', () => {
    const rules = goldFillRules()
    expect(rules.length).toBeGreaterThan(5) // the audit found button, pill, avatar, chips, profile card, alert button
    for (const { selector, body } of rules) {
      expect(body, `${selector} fills with gold but has no 1px var(--accent-edge) edge`).toMatch(/inset 0 0 0 1px var\(--accent-edge\)/)
    }
  })

  it('defines the edge as transparent in dark and the darker gold in light', () => {
    expect(css).toMatch(/:root\s*\{[^}]*--accent-edge:\s*transparent/s)
    expect(css).toMatch(/prefers-color-scheme: light\)\s*\{\s*:root\s*\{[^}]*--accent-edge:\s*var\(--accent-text\)/s)
  })

  it('draws gold marks that are not controls (dot, progress fill, invalid border) with --accent-text', () => {
    expect(css).toMatch(/\.alert-dot\s*\{[^}]*background:\s*var\(--accent-text\)/s)
    expect(css).toMatch(/\.progress-fill\s*\{[^}]*background:\s*var\(--accent-text\)/)
    expect(css).toMatch(/\.passcode-field\[aria-invalid="true"\]\s*\{\s*border:\s*2px solid var\(--accent-text\)/)
  })

  it('keeps the Watch tonight button at 36px with a 44px hit area', () => {
    expect(css).toMatch(/\.alert-watch\s*\{[^}]*height:\s*36px/s)
    expect(css).toMatch(/\.alert-watch::after\s*\{[^}]*inset:\s*-4px 0/)
  })
})
