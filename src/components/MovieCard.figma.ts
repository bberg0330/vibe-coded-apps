// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=8-72
// component=MovieCard
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/MovieCard.tsx

import figma from 'figma'

// Figma exposes title/year/criticScore as flat text props, but MovieCard takes a
// whole `Movie`, so only the State variant maps. `watched` and `pending` are
// interpolated rather than passed through renderProp, which omits a false boolean
// entirely — `watched` is required, so the snippet has to spell it out.
const watched = figma.selectedInstance.getEnum('State', {
  Default: false,
  Watched: true,
  'Watching tonight': false,
  Pending: false,
})
const pending = figma.selectedInstance.getEnum('State', {
  Default: false,
  Watched: false,
  'Watching tonight': false,
  Pending: true,
})
const watchingLabel = figma.selectedInstance.getEnum('State', {
  'Watching tonight': 'Watching tonight',
})

// The nested watchlist-btn (WatchlistButton) is an exposed instance whose
// Default/Saved state lives on the child, not on MovieCard's own props, so
// `onWatchlist` is shown wired to the caller's value rather than mapped.

// Built by hand rather than with renderProp, which prepends a space and so puts
// the prop on the same line as `pending`, breaking the one-prop-per-line snippet.
const watchingLabelProp = watchingLabel ? `\n  watchingLabel="${watchingLabel}"` : ''

export default {
  id: 'MovieCard',
  imports: ["import { MovieCard } from './MovieCard'"],
  example: figma.code`<MovieCard
  movie={movie}
  watched={${watched}}
  pending={${pending}}${watchingLabelProp}
  onOpen={onOpenMovie}
  onToggleWatched={onToggleWatched}
  onToggleWatchlist={onToggleWatchlist}
  onWatchlist={onWatchlist}
/>`,
  metadata: { nestable: true },
}
