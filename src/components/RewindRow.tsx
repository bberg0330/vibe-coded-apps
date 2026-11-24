import { posterUrl } from '../api/tmdb'
import { IconButton } from './IconButton'
import { Poster } from './Poster'
import { Pill } from './Pill'
import { WatchlistButton } from './WatchlistButton'
import type { ScoreData } from '../data/scores'

/**
 * A film in a Rewind year: rank, poster, title, scores, where it's
 * watchable (Stream/Rent pill), and two 44px actions: add to watchlist and
 * mark as watched. Watched films stay in the list, dimmed, with a green ✓.
 * Same card shell as WatchlistRow. .card.rewind-row
 */
export function RewindRow({
  rank, title, posterPath, scores, where, watched, onWatchlist, pending = false,
  onOpen, onToggleWatchlist, onToggleWatched, canUnmark = true,
}: {
  rank: number
  title: string
  posterPath: string | null
  scores?: ScoreData
  /** "Stream · Netflix" / "Rent · Apple TV", or null when not watchable at home. */
  where: string | null
  watched: boolean
  onWatchlist: boolean
  pending?: boolean
  onOpen: () => void
  onToggleWatchlist: () => void
  onToggleWatched: () => void
  /** False when the film was logged as a dated movie night: Rewind only undoes its own "seen before" marks. */
  canUnmark?: boolean
}) {
  return (
    <div className={watched ? 'card rewind-row watched' : 'card rewind-row'}>
      <span className="rewind-rank" aria-label={`Number ${rank}`}>{rank}</span>
      <button className="card-main" onClick={onOpen}>
        <Poster src={posterUrl(posterPath)} />
        <div className="card-body">
          <div className="card-title">{title}</div>
          <div className="card-meta">
            {typeof scores?.critic === 'number' && (
              <span className="score" title="Critic score"><span aria-hidden="true">🍅</span> {scores.critic}%<span className="sr-only"> critic score</span></span>
            )}
            {typeof scores?.audience === 'number' && (
              <span className="score" title="IMDb user rating"><span aria-hidden="true">⭐</span> {scores.audience}%<span className="sr-only"> audience score</span></span>
            )}
          </div>
          {where && <Pill>{where}</Pill>}
        </div>
      </button>
      <div className="card-actions">
        <WatchlistButton title={title} saved={onWatchlist} disabled={pending} onClick={(e) => { e.stopPropagation(); onToggleWatchlist() }} />
        <IconButton
          icon="✓"
          watched={watched}
          ariaLabel={watched ? `${title} watched${canUnmark ? '. Unmark' : ''}` : `Mark ${title} as watched`}
          ariaPressed={watched}
          disabled={pending || (watched && !canUnmark)}
          onClick={(e) => { e.stopPropagation(); onToggleWatched() }}
        />
      </div>
    </div>
  )
}
