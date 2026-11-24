/**
 * Placeholder rows in the shape of a card (poster + two text lines), so the
 * list doesn't jump when real rows arrive. The visible rows are aria-hidden;
 * `label` is what assistive tech hears instead. .skeleton-row
 */
export function SkeletonRows({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <div aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div className="card skeleton-row" key={i} aria-hidden="true" data-testid="skeleton-row">
          <div className="skeleton-block skeleton-poster" />
          <div className="skeleton-lines">
            <div className="skeleton-block skeleton-line long" />
            <div className="skeleton-block skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  )
}
