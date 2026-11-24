import { useEffect, useState } from 'react'
import { getRewindYears, type RewindYearSummary } from '../api/rewind'
import { watchCount } from '../data/history'
import { ErrorRetry } from '../components/ErrorRetry'
import { SkeletonRows } from '../components/SkeletonRows'
import { YearTile } from '../components/YearTile'

/** Rewind home: a grid of every year that's ready, newest first, with household progress. */
export function RewindScreen({ onOpenYear }: { onOpenYear: (year: number) => void }) {
  const [years, setYears] = useState<RewindYearSummary[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setError(false)
    getRewindYears().then((y) => { if (live) setYears(y) }, () => { if (live) setError(true) })
    return () => { live = false }
  }, [attempt])

  return (
    <div className="screen">
      <h1 className="rewind-title">Rewind</h1>
      <p className="empty rewind-sub">The best of each year you missed in theaters.</p>
      {error && <ErrorRetry message="Couldn't load Rewind." onRetry={() => setAttempt((a) => a + 1)} />}
      {!error && years === null && <SkeletonRows label="Loading years" count={2} />}
      {years && years.length === 0 && <p className="empty">No years are ready yet. The first unlocks once its scores arrive.</p>}
      {years && years.length > 0 && (
        <>
          <div className="year-grid">
            {years.map(({ year, ids }) => (
              <YearTile
                key={year}
                year={year}
                watched={ids.filter((id) => watchCount(id) > 0).length}
                total={ids.length}
                onOpen={() => onOpenYear(year)}
              />
            ))}
          </div>
          <p className="empty rewind-sub">A new year unlocks most nights as scores arrive.</p>
        </>
      )}
    </div>
  )
}
