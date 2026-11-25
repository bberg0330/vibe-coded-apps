import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// api/store.ts imports this module at runtime on Vercel, which compiles .ts to
// .js but does NOT rewrite import specifiers. A `.ts` specifier then fails with
// ERR_MODULE_NOT_FOUND and every /api/store request returns 500. Use `.js`
// (or no extension for type-only imports), as the other src/ files used by api/ do.
describe('storeReducer.ts runtime imports', () => {
  it('has no relative import with a .ts extension', () => {
    const src = readFileSync(new URL('../src/data/storeReducer.ts', import.meta.url), 'utf8')
    const bad = [...src.matchAll(/from\s+'(\.[^']*\.ts)'/g)].map((m) => m[1])
    expect(bad).toEqual([])
  })
})
