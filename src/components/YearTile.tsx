/**
 * One year in the Rewind grid: the year, household progress against its
 * top films, and a progress bar. Tapping opens the year. .year-tile
 */
export function YearTile({ year, watched, total, onOpen }: {
  year: number
  watched: number
  total: number
  onOpen: () => void
}) {
  return (
    <button className="year-tile" onClick={onOpen} aria-label={`Rewind ${year}, ${watched} of ${total} watched`}>
      <span className="year-tile-year">{year}</span>
      <Progress watched={watched} total={total} />
      <span className="year-tile-count">{watched} of {total} watched</span>
    </button>
  )
}

/** 6px bar, --accent on --control-bg. Decorative: the text beside it says the same. */
export function Progress({ watched, total }: { watched: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (watched / total) * 100) : 0
  return (
    <span className="progress" aria-hidden="true">
      <span className="progress-fill" style={{ width: `${pct}%` }} />
    </span>
  )
}
