import { useEffect, useMemo, useState } from 'react'
import { getRewindYear, type RewindFilm } from '../api/rewind'
import { getWatchProviders } from '../api/tmdb'
import { getCachedScores } from '../data/scores'
import { getEnabledServices, RENT_SERVICES, SERVICES } from '../data/providers'
import { getSeenBefore, watchCount } from '../data/history'
import { Button } from '../components/Button'
import { Chip } from '../components/Chip'
import { ErrorRetry } from '../components/ErrorRetry'
import { OptionSheet } from '../components/OptionSheet'
import { RewindRow } from '../components/RewindRow'
import { ScoreLegend } from '../components/ScoreLegend'
import { SkeletonRows } from '../components/SkeletonRows'
import { Progress } from '../components/YearTile'
import type { Availability } from '../types'

type Sort = 'rating' | 'critic' | 'popularity'
const SORTS: { value: Sort; label: string }[] = [
  { value: 'rating', label: 'Rating' },
  { value: 'critic', label: 'Critic score' },
  { value: 'popularity', label: 'Popularity' },
]

/** "Stream · Netflix" for a service you have, else "Rent · Apple TV", else null. */
export function whereToWatch(a: Availability | undefined, enabled = getEnabledServices()): string | null {
  const stream = a?.streaming.find((k) => enabled.includes(k))
  if (stream) return `Stream · ${SERVICES[stream].label}`
  const rent = a?.rent[0]
  return rent ? `Rent · ${RENT_SERVICES[rent].label}` : null
}

/**
 * One Rewind year: the top films in rank order, household progress, sort,
 * and "Watchable now" (on by default: your services or a rental). Progress
 * always counts the whole list, whatever the filter shows. A year that
 * isn't ready shows an "unlocks soon" message instead.
 */
export function RewindYearScreen({
  year, onBackToRewind, onOpenFilm, isOnWatchlist, onToggleWatchlist, onToggleWatched, isPending, version,
}: {
  year: number
  onBackToRewind: () => void
  onOpenFilm: (film: RewindFilm) => void
  isOnWatchlist: (tmdbId: number) => boolean
  onToggleWatchlist: (film: RewindFilm, availability: Availability | undefined) => void
  onToggleWatched: (film: RewindFilm, availability: Availability | undefined) => void
  isPending: (tmdbId: number) => boolean
  /** Bumped by the parent after a history or watchlist write, to re-read them. */
  version?: number
}) {
  const [films, setFilms] = useState<RewindFilm[] | null | 'locked'>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [where, setWhere] = useState<Map<number, Availability>>(new Map())
  const [watchableOnly, setWatchableOnly] = useState(true)
  const [sort, setSort] = useState<Sort>('rating')
  const [sortOpen, setSortOpen] = useState(false)

  useEffect(() => {
    let live = true
    setError(false); setFilms(null)
    getRewindYear(year).then((f) => { if (live) setFilms(f ?? 'locked') }, () => { if (live) setError(true) })
    return () => { live = false }
  }, [year, attempt])

  // Where each film is watchable, a few at a time (the http cache keeps repeats free).
  useEffect(() => {
    if (!Array.isArray(films)) return
    let live = true
    const queue = films.map((f) => f.tmdbId)
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined && live; id = queue.shift()) {
        const a = await getWatchProviders(id).catch(() => ({ streaming: [], rent: [] }) as Availability)
        if (live) setWhere((m) => new Map(m).set(id, a))
      }
    }
    void Promise.all(Array.from({ length: 6 }, worker))
    return () => { live = false }
  }, [films])

  const seenBefore = useMemo(() => new Set(getSeenBefore().map((e) => e.movie.tmdbId)), [version, films])

  if (error) return <div className="screen"><ErrorRetry message={`Couldn't load Rewind ${year}.`} onRetry={() => setAttempt((a) => a + 1)} /></div>
  if (films === 'locked') {
    return (
      <div className="screen rewind-locked">
        <span className="rewind-lock" aria-hidden="true">🔒</span>
        <h1>Rewind {year} unlocks soon</h1>
        <p className="empty">Scores for {year} are still arriving.</p>
        <Button onClick={onBackToRewind}>Back to Rewind</Button>
      </div>
    )
  }

  const list = films ?? []
  const watchedCount = list.filter((f) => watchCount(f.tmdbId) > 0).length
  const loadingWhere = list.some((f) => !where.has(f.tmdbId))
  const ranked = list.map((f, i) => ({ film: f, rank: i + 1 }))
  const sorted = sort === 'rating' ? ranked : [...ranked].sort((a, b) =>
    sort === 'popularity'
      ? b.film.popularity - a.film.popularity
      : (getCachedScores(b.film.tmdbId)?.critic ?? -1) - (getCachedScores(a.film.tmdbId)?.critic ?? -1))
  const shown = watchableOnly ? sorted.filter(({ film }) => whereToWatch(where.get(film.tmdbId)) !== null) : sorted

  return (
    <div className="screen">
      <h1 className="rewind-title">Rewind {year}</h1>
      {films && (
        <div className="rewind-progress">
          <Progress watched={watchedCount} total={list.length} />
          <span className="empty">{watchedCount} of {list.length} watched</span>
        </div>
      )}
      <div className="rewind-controls">
        <Chip label={`Sort: ${SORTS.find((s) => s.value === sort)!.label} ▾`} active={false} onClick={() => setSortOpen(true)} />
        <Chip label={watchableOnly ? '✓ Watchable now' : 'Watchable now'} active={watchableOnly} onClick={() => setWatchableOnly((w) => !w)} />
      </div>
      <ScoreLegend />
      {films === null && <SkeletonRows label={`Loading Rewind ${year}`} />}
      {films && watchableOnly && loadingWhere && shown.length === 0 && <SkeletonRows label="Checking where to watch" />}
      {films && !loadingWhere && shown.length === 0 && (
        <p className="empty">None of these are on your services or for rent right now. Turn off Watchable now to see them all.</p>
      )}
      {shown.map(({ film, rank }) => {
        const watched = watchCount(film.tmdbId) > 0
        return (
          <RewindRow
            key={film.tmdbId}
            rank={rank}
            title={film.title}
            posterPath={film.posterPath}
            scores={getCachedScores(film.tmdbId)}
            where={whereToWatch(where.get(film.tmdbId))}
            watched={watched}
            canUnmark={!watched || seenBefore.has(film.tmdbId)}
            onWatchlist={isOnWatchlist(film.tmdbId)}
            pending={isPending(film.tmdbId)}
            onOpen={() => onOpenFilm(film)}
            onToggleWatchlist={() => onToggleWatchlist(film, where.get(film.tmdbId))}
            onToggleWatched={() => onToggleWatched(film, where.get(film.tmdbId))}
          />
        )
      })}
      {sortOpen && (
        <OptionSheet title="Sort" options={SORTS} selected={sort} onSelect={setSort} onClose={() => setSortOpen(false)} />
      )}
    </div>
  )
}
