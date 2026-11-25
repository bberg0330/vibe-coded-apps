import { Icon } from './icons'
import { Button } from './Button'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { formatReleaseDate, type ReleaseNote } from '../data/releaseNotes'

/**
 * The "What's new" bottom sheet: a headline, a subtitle with the release
 * date, up to four icon + title + one-line rows, and "Got it". Shown once per
 * release and reopenable from Settings. "Got it", the scrim or Escape closes
 * it; focus is held inside while open (useDialogFocus). .whats-new
 */
export function WhatsNewSheet({ release, onClose }: { release: ReleaseNote; onClose: () => void }) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose)
  return (
    <>
      <button className="scrim" aria-label="Close what's new" tabIndex={-1} onClick={onClose} />
      <div className="sheet whats-new" role="dialog" tabIndex={-1} ref={dialogRef} aria-modal="true" aria-labelledby="whats-new-title">
        <div className="whats-new-head">
          <h2 id="whats-new-title">{release.title}</h2>
          <p>{release.subtitle} · {formatReleaseDate(release.date)}</p>
        </div>
        <ul className="whats-new-rows">
          {release.rows.map((row) => (
            <li className="whats-new-row" key={row.title}>
              <span className="whats-new-icon" aria-hidden="true">
                {row.icon ? <Icon name={row.icon} /> : row.glyph}
              </span>
              <span className="whats-new-copy">
                <strong>{row.title}</strong>
                <span>{row.body}</span>
              </span>
            </li>
          ))}
        </ul>
        <Button className="whats-new-done" onClick={onClose}>Got it</Button>
      </div>
    </>
  )
}
