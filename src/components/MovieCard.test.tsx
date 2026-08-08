import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MovieCard } from './MovieCard'
import type { Movie } from '../types'

const movie: Movie = {
  tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: '/p.jpg',
  popularity: 18, tomatometer: 90,
  availability: { streaming: ['netflix', 'hbomax'], rent: [] },
}

describe('MovieCard', () => {
  it('shows title, year and score', () => {
    render(<MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={0} />)
    expect(screen.getByText('Rushmore')).toBeInTheDocument()
    expect(screen.getByText('1998')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
  })

  it('badges every service the film streams on', () => {
    render(<MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={0} />)
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('HBO Max')).toBeInTheDocument()
  })

  it('shows "No score" when the tomatometer is unknown', () => {
    render(
      <MovieCard movie={{ ...movie, tomatometer: null }} onOpen={vi.fn()}
        onToggleWatched={vi.fn()} watched={0} />,
    )
    expect(screen.getByText('No score')).toBeInTheDocument()
  })

  it('opens the film when the card is tapped', async () => {
    const onOpen = vi.fn()
    render(<MovieCard movie={movie} onOpen={onOpen} onToggleWatched={vi.fn()} watched={0} />)

    await userEvent.click(screen.getByRole('button', { name: /^rushmore/i }))
    expect(onOpen).toHaveBeenCalledWith(movie)
  })

  it('logs a watch without opening the film', async () => {
    const onOpen = vi.fn()
    const onToggleWatched = vi.fn()
    render(<MovieCard movie={movie} onOpen={onOpen} onToggleWatched={onToggleWatched} watched={0} />)

    await userEvent.click(screen.getByRole('button', { name: /mark rushmore as watched/i }))

    expect(onToggleWatched).toHaveBeenCalledWith(movie)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows a rewatch count once watched more than once', () => {
    render(<MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={2} />)
    expect(screen.getByText('2×')).toBeInTheDocument()
  })

  it('shows rental storefronts for a rent-tier film', () => {
    render(
      <MovieCard
        movie={{ ...movie, availability: { streaming: [], rent: ['appletv_store', 'youtube'] } }}
        onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={0} />,
    )
    expect(screen.getByText('Apple TV')).toBeInTheDocument()
    expect(screen.getByText('YouTube')).toBeInTheDocument()
  })
})
