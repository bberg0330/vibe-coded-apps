import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MovieCard } from './MovieCard'
import type { Movie } from '../types'

const movie: Movie = {
  tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: '/p.jpg',
  popularity: 18, tomatometer: 90, popcornmeter: null,
  availability: { streaming: ['netflix', 'hbomax'], rent: [] },
  overview: null,
}

describe('MovieCard', () => {
  it('shows title, year and score', () => {
    render(<MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={false} />)
    expect(screen.getByText('Rushmore')).toBeInTheDocument()
    expect(screen.getByText('1998')).toBeInTheDocument()
    expect(screen.getByText('🍅 90%')).toBeInTheDocument()
  })

  it('badges every service the film streams on', () => {
    render(<MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={false} />)
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('HBO Max')).toBeInTheDocument()
  })

  it('shows "No critic score" when the tomatometer is unknown', () => {
    render(
      <MovieCard movie={{ ...movie, tomatometer: null }} onOpen={vi.fn()}
        onToggleWatched={vi.fn()} watched={false} />,
    )
    expect(screen.getByText('No critic score')).toBeInTheDocument()
  })

  it('shows the audience score badge when popcornmeter is known', () => {
    render(
      <MovieCard movie={{ ...movie, popcornmeter: 82 }} onOpen={vi.fn()}
        onToggleWatched={vi.fn()} watched={false} />,
    )
    // ⭐, not 🍿: the number is IMDb's user rating scaled to a percentage,
    // not Rotten Tomatoes' Popcornmeter, which has no public API.
    expect(screen.getByText('⭐ 82%')).toBeInTheDocument()
  })

  it('opens the film when the card is tapped', async () => {
    const onOpen = vi.fn()
    render(<MovieCard movie={movie} onOpen={onOpen} onToggleWatched={vi.fn()} watched={false} />)

    await userEvent.click(screen.getByRole('button', { name: /^rushmore/i }))
    expect(onOpen).toHaveBeenCalledWith(movie)
  })

  it('logs a watch without opening the film', async () => {
    const onOpen = vi.fn()
    const onToggleWatched = vi.fn()
    render(<MovieCard movie={movie} onOpen={onOpen} onToggleWatched={onToggleWatched} watched={false} />)

    await userEvent.click(screen.getByRole('button', { name: /mark rushmore as watched/i }))

    expect(onToggleWatched).toHaveBeenCalledWith(movie)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows the checked state once watched', () => {
    render(<MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched />)
    expect(screen.getByRole('button', { name: /undo watched for rushmore/i }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('disables the watch button while a save is pending, and ignores a click on it', async () => {
    const onToggleWatched = vi.fn()
    render(
      <MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={onToggleWatched}
        watched={false} pending />,
    )

    const button = screen.getByRole('button', { name: /mark rushmore as watched/i })
    expect(button).toBeDisabled()

    await userEvent.click(button)
    expect(onToggleWatched).not.toHaveBeenCalled()
  })

  it('shows rental storefronts for a rent-tier film', () => {
    render(
      <MovieCard
        movie={{ ...movie, availability: { streaming: [], rent: ['appletv_store', 'youtube'] } }}
        onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={false} />,
    )
    expect(screen.getByText('Apple TV')).toBeInTheDocument()
    expect(screen.getByText('YouTube')).toBeInTheDocument()
  })

  it('renders the main area as non-interactive when noOpen is set', () => {
    const onOpen = vi.fn()
    render(<MovieCard movie={movie} onOpen={onOpen} onToggleWatched={vi.fn()} watched={false} noOpen />)

    // No tappable "open" target for the title itself; only the watch button remains a button.
    expect(screen.queryByRole('button', { name: /^rushmore/i })).not.toBeInTheDocument()
    expect(screen.getByText('Rushmore')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark rushmore as watched/i })).toBeInTheDocument()
  })

  it('still logs a watch when noOpen is set', async () => {
    const onToggleWatched = vi.fn()
    render(<MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={onToggleWatched} watched={false} noOpen />)

    await userEvent.click(screen.getByRole('button', { name: /mark rushmore as watched/i }))
    expect(onToggleWatched).toHaveBeenCalledWith(movie)
  })

  describe('watching tonight', () => {
    it('does not render a clock button when onStartWatching is omitted', () => {
      render(<MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={false} />)
      expect(screen.queryByRole('button', { name: /start watching/i })).not.toBeInTheDocument()
    })

    it('starts watching without opening the film', async () => {
      const onOpen = vi.fn()
      const onStartWatching = vi.fn()
      render(
        <MovieCard movie={movie} onOpen={onOpen} onToggleWatched={vi.fn()} watched={false}
          onStartWatching={onStartWatching} />,
      )

      await userEvent.click(screen.getByRole('button', { name: /start watching rushmore tonight/i }))

      expect(onStartWatching).toHaveBeenCalledWith(movie)
      expect(onOpen).not.toHaveBeenCalled()
    })

    it('disables the clock button when there is no active profile, and ignores a click on it', async () => {
      const onStartWatching = vi.fn()
      render(
        <MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={false}
          onStartWatching={onStartWatching} startWatchingDisabled />,
      )

      const button = screen.getByRole('button', { name: /start watching rushmore tonight/i })
      expect(button).toBeDisabled()

      await userEvent.click(button)
      expect(onStartWatching).not.toHaveBeenCalled()
    })

    it('disables the clock button while a save is pending', () => {
      render(
        <MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={false}
          onStartWatching={vi.fn()} pending />,
      )
      expect(screen.getByRole('button', { name: /start watching rushmore tonight/i })).toBeDisabled()
    })

    it('shows the watching pill when a label is provided', () => {
      render(
        <MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={false}
          watchingLabel="Watching tonight" />,
      )
      expect(screen.getByText('Watching tonight')).toBeInTheDocument()
    })

    it('shows no pill when the label is null', () => {
      render(
        <MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={false}
          watchingLabel={null} />,
      )
      expect(screen.queryByText('Watching tonight')).not.toBeInTheDocument()
    })
  })
})
