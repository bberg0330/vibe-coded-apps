import { describe, expect, it } from 'vitest'
import { scoresFromOmdb, type OmdbResponse } from './omdbParse'

const hit = (extra: Partial<OmdbResponse>): OmdbResponse => ({ Response: 'True', Year: '2025', imdbRating: '7.6', ...extra })

describe('scoresFromOmdb', () => {
  it('takes the critic score from Metascore', () => {
    expect(scoresFromOmdb(hit({ Metascore: '67' }), 2025)).toEqual({ critic: 67, audience: 76 })
  })

  it('reads "N/A" or a missing Metascore as no critic score', () => {
    expect(scoresFromOmdb(hit({ Metascore: 'N/A' }), 2025).critic).toBeNull()
    expect(scoresFromOmdb(hit({}), 2025).critic).toBeNull()
  })

  it('ignores a Rotten Tomatoes rating, which OMDb no longer sends', () => {
    const data = { ...hit({}), Ratings: [{ Source: 'Rotten Tomatoes', Value: '90%' }] } as OmdbResponse
    expect(scoresFromOmdb(data, 2025).critic).toBeNull()
  })
})
