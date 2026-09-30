import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecommendationCard } from './RecommendationCard'
import type { Movie } from '../types'

const movie = (overrides: Partial<Movie> = {}): Movie => ({
  tmdbId: 1, title: 'Fantastic Mr. Fox', year: 2009, posterPath: null, popularity: 1,
  tomatometer: 93, popcornmeter: 79, availability: { streaming: [], rent: [] }, overview: null,
  ...overrides,
})

describe('RecommendationCard', () => {
  it('shows both the critic and audience scores', () => {
    render(<RecommendationCard movie={movie()} />)
    expect(screen.getByTitle('Critic score')).toHaveTextContent('🍅 93%')
    expect(screen.getByTitle('IMDb user rating')).toHaveTextContent('⭐ 79%')
  })

  it('hides a missing score rather than showing a placeholder', () => {
    render(<RecommendationCard movie={movie({ popcornmeter: null })} />)
    expect(screen.getByTitle('Critic score')).toBeInTheDocument()
    expect(screen.queryByTitle('IMDb user rating')).not.toBeInTheDocument()
  })

  it('no longer shows the year', () => {
    render(<RecommendationCard movie={movie()} />)
    expect(screen.queryByText('2009')).not.toBeInTheDocument()
  })
})
