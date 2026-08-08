import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mergeScores, readScores } from './scores-api'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'mn-scores-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('mergeScores', () => {
  it('stores a score and returns the full map', async () => {
    const map = await mergeScores(dir, { '1585': 90 })
    expect(map['1585']).toBe(90)
  })

  it('merges rather than replacing', async () => {
    await mergeScores(dir, { '1': 90 })
    const map = await mergeScores(dir, { '2': 80 })
    expect(map).toEqual({ '1': 90, '2': 80 })
  })

  it('preserves a cached null, which means "OMDb has no score"', async () => {
    const map = await mergeScores(dir, { '3': null })
    expect(map['3']).toBeNull()
    expect('3' in map).toBe(true)
  })

  it('preserves a genuine zero distinctly from null', async () => {
    const map = await mergeScores(dir, { '4': 0 })
    expect(map['4']).toBe(0)
  })

  it('CONCURRENT merges all survive', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => mergeScores(dir, { [String(i)]: i })),
    )
    const map = await readScores(dir)
    expect(Object.keys(map)).toHaveLength(20)
  })

  it('reads an empty map when the file is absent', async () => {
    expect(await readScores(dir)).toEqual({})
  })

  it('reads an empty map when the file is corrupt rather than throwing', async () => {
    await mergeScores(dir, { '1': 90 })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(dir, 'scores.json'), '{{{')
    expect(await readScores(dir)).toEqual({})
  })

  it('writes atomically, leaving no temp file', async () => {
    await mergeScores(dir, { '1': 90 })
    const { readdir } = await import('node:fs/promises')
    expect(await readdir(dir)).toEqual(['scores.json'])
  })

  it('does not invoke git', async () => {
    await mergeScores(dir, { '1': 90 })
    const raw = await readFile(join(dir, 'scores.json'), 'utf8')
    expect(JSON.parse(raw)['1']).toBe(90)
    // No .git directory is created, and no commit is attempted: scores are
    // regenerable and must not bury movie-night commits.
    const { readdir } = await import('node:fs/promises')
    expect(await readdir(dir)).not.toContain('.git')
  })
})
