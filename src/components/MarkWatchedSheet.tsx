import { posterUrl } from '../api/tmdb'
import { Poster } from './Poster'
import { SectionHeading } from './SectionHeading'
import { SheetOption } from './SheetOption'
import { useDialogFocus } from '../hooks/useDialogFocus'
import type { Movie } from '../types'

/**
 * The "Mark as watched" sheet a ✓ opens for a film with no history: which
 * film it is, then Tonight (a dated movie night) or Some time ago (an
 * undated "Seen before" entry). Picking a row applies it, like OptionSheet;
 * Cancel, the scrim or Escape closes with no change. Figma: Mark as watched
 * sheet. .sheet.mark-sheet
 */
export function MarkWatchedSheet({
  movie, onTonight, onEarlier, onClose,
}: {
  movie: Movie
  onTonight: () => void
  onEarlier: () => void
  onClose: () => void
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose)
  return (
    <>
      <button className="scrim" aria-label="Close Mark as watched" tabIndex={-1} onClick={onClose} />
      <div className="sheet mark-sheet" role="dialog" tabIndex={-1} ref={dialogRef} aria-modal="true" aria-label="Mark as watched">
        <div className="topbar">
          <SectionHeading>Mark as watched</SectionHeading>
          <button className="link tap-target" onClick={onClose}>Cancel</button>
        </div>
        <div className="mark-sheet-film">
          <Poster src={posterUrl(movie.posterPath)} />
          <div className="mark-sheet-film-text">
            <span className="mark-sheet-title">{movie.title}</span>
            {movie.year !== null && <span className="mark-sheet-year">{movie.year}</span>}
          </div>
        </div>
        <div role="radiogroup" aria-label="Mark as watched">
          <SheetOption
            label="Tonight"
            description="Goes in History with today's date"
            selected={false}
            onSelect={onTonight}
          />
          <SheetOption
            label="Some time ago"
            description="Goes in Seen before, with no date"
            selected={false}
            onSelect={onEarlier}
          />
        </div>
      </div>
    </>
  )
}
