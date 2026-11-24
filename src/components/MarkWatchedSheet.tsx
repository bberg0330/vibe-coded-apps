import { posterUrl } from '../api/tmdb'
import { Poster } from './Poster'
import { SectionHeading } from './SectionHeading'
import { SheetOption } from './SheetOption'
import { useDialogFocus } from '../hooks/useDialogFocus'
import type { Movie } from '../types'

/** Asks a question, unlike the noun titles of the picker sheets: it wants a choice. */
const TITLE = 'When did you watch it?'

/**
 * The "Mark as watched" sheet a ✓ opens for a film with no history: which
 * film it is, then Tonight (a dated movie night) or Some time ago (an
 * undated "Seen before" entry). Picking a row applies it, like OptionSheet;
 * Cancel, the scrim or Escape closes with no change. A hairline sits between
 * the two rows. Figma: Mark as watched sheet. .sheet.mark-sheet
 */
export function MarkWatchedSheet({
  movie, onTonight, onEarlier, onClose, tonightTicked = false,
}: {
  movie: Movie
  /** Opened from "Not tonight?": Tonight is what's logged now, so it shows ticked. */
  tonightTicked?: boolean
  onTonight: () => void
  onEarlier: () => void
  onClose: () => void
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose)
  return (
    <>
      <button className="scrim" aria-label={`Close ${TITLE}`} tabIndex={-1} onClick={onClose} />
      <div className="sheet mark-sheet" role="dialog" tabIndex={-1} ref={dialogRef} aria-modal="true" aria-label={TITLE}>
        <div className="topbar">
          <SectionHeading>{TITLE}</SectionHeading>
          <button className="link tap-target" onClick={onClose}>Cancel</button>
        </div>
        <div className="mark-sheet-film">
          <Poster src={posterUrl(movie.posterPath)} />
          <div className="mark-sheet-film-text">
            <span className="mark-sheet-title">{movie.title}</span>
            {movie.year !== null && <span className="mark-sheet-year">{movie.year}</span>}
          </div>
        </div>
        <div role="radiogroup" aria-label={TITLE}>
          <SheetOption
            label="Tonight"
            description="Goes in History with today's date"
            selected={tonightTicked}
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
