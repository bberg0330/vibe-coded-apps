import { useEffect, useMemo, useState } from 'react'
import { getRewindYear, type RewindFilm } from '../api/rewind'
import { getWatchProviders } from '../api/tmdb'
import { getCachedScores } from '../data/scores'
import { getEnabledServices } from '../data/providers'
import { whereToWatch } from '../data/providerIds'
import { getSeenBefore, watchCount } from '../data/history'
import { rewindProgress } from '../data/rewindProgress'
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

/**
 * One Rewind year: the top films in rank order, household progress, sort,
 * and "Watchable now" (off when a year opens, so the whole list shows, and not
 * remembered; on: your services or a rental). Progress
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
  const [formerIds, setFormerIds] = useState<number[]>([])
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [where, setWhere] = useState<Map<number, Availability>>(new Map())
  const [watchableOnly, setWatchableOnly] = useState(false)
  const [sort, setSort] = useState<Sort>('rating')
  const [sortOpen, setSortOpen] = useState(false)

  useEffect(() => {
    let live = true
    setError(false); setFilms(null)
    getRewindYear(year).then((y) => {
      if (!live) return
      setFilms(y ? y.films : 'locked')
      setFormerIds(y ? y.formerIds : [])
    }, () => { if (live) setError(true) })
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

  const enabled = getEnabledServices()
  const list = films ?? []
  const watchedCount = rewindProgress(list.map((f) => f.tmdbId), formerIds)
  const loadingWhere = list.some((f) => !where.has(f.tmdbId))
  const ranked = list.map((f, i) => ({ film: f, rank: i + 1 }))
  const sorted = sort === 'rating' ? ranked : [...ranked].sort((a, b) =>
    sort === 'popularity'
      ? b.film.popularity - a.film.popularity
      : (getCachedScores(b.film.tmdbId)?.critic ?? -1) - (getCachedScores(a.film.tmdbId)?.critic ?? -1))
  const shown = watchableOnly ? sorted.filter(({ film }) => whereToWatch(where.get(film.tmdbId), enabled) !== null) : sorted

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
      {films !== null && list.length === 0 && <p className="empty">No films from {year} have enough votes to rank.</p>}
      {films && watchableOnly && loadingWhere && shown.length === 0 && <SkeletonRows label="Checking where to watch" />}
      {films && list.length > 0 && !loadingWhere && shown.length === 0 && (
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
            where={whereToWatch(where.get(film.tmdbId), enabled)}
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
