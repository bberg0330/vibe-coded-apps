// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Comments are stripped first so a brace or a selector-looking line inside one can't hide or rename a rule.
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Every leaf rule (inside @media too) as { selector, body }. */
function rules(): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  for (let m = re.exec(css); m; m = re.exec(css)) out.push({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] })
  return out
}
const rule = (selector: string) => rules().filter((r) => r.selector.endsWith(selector))

/** The gold FILLS: `background` or `background-color` set to var(--accent), not --accent-text or --accent-fg. */
const goldFills = () => rules().filter((r) => /background(?:-color)?:\s*var\(--accent\)(?![\w-])/.test(r.body))

/** Controls and tags the audit found. A new gold fill is caught by the loop below even if it is not listed. */
const KNOWN_GOLD_FILLS = [
  '.pill',
  '.btn',
  '.avatar',
  '.chip[aria-pressed="true"]',
  '.rewind-controls .chip[aria-pressed="true"]',
  '.profile-card[aria-checked="true"]',
  '.alert-watch',
]

describe('gold in light mode', () => {
  it('gives every gold fill the 1px edge, so the shape shows on a light surface', () => {
    const selectors = goldFills().map((r) => r.selector)
    for (const known of KNOWN_GOLD_FILLS) expect(selectors, `${known} should still be a gold fill`).toContain(known)
    for (const { selector, body } of goldFills()) {
      expect(body, `${selector} fills with gold but has no 1px var(--accent-edge) edge`).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--accent-edge\)/)
    }
  })

  it('does not put the edge on the disabled profile-gate button, which is grey', () => {
    const [r] = rule('.profile-gate .btn:disabled')
    expect(r.body).toMatch(/box-shadow:\s*none/)
  })

  it('defines the edge as transparent in dark and the darker gold in light', () => {
    expect(css).toMatch(/:root\s*\{[^}]*--accent-edge:\s*transparent/s)
    expect(css).toMatch(/prefers-color-scheme: light\)\s*\{\s*:root\s*\{[^}]*--accent-edge:\s*var\(--accent-text\)/s)
  })

  it('draws gold marks that are not controls (dot, progress fill, invalid border) with --accent-text', () => {
    expect(rule('.alert-dot')[0].body).toMatch(/background:\s*var\(--accent-text\)/)
    expect(rule('.progress-fill')[0].body).toMatch(/background:\s*var\(--accent-text\)/)
    expect(rule('.passcode-field[aria-invalid="true"]')[0].body).toMatch(/border:\s*2px solid var\(--accent-text\)/)
  })

  it('keeps Watch tonight at 36px with a taller hit area', () => {
    expect(rule('.alert-watch')[0].body).toMatch(/height:\s*36px/)
    expect(rule('.alert-watch::after')[0].body).toMatch(/inset:\s*-4px 0/)
  })
})
