// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=385-125
// component=RewindRow
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/RewindRow.tsx

import figma from 'figma'

const rank = figma.selectedInstance.getString('rank')
const title = figma.selectedInstance.getString('title')

export default {
  id: 'RewindRow',
  imports: ["import { RewindRow } from './RewindRow'"],
  example: figma.code`<RewindRow
  rank={${rank}}
  title="${title}"
  posterPath={film.posterPath}
  scores={getCachedScores(film.tmdbId)}
  where={whereToWatch(availability)}
  watched={watchCount(film.tmdbId) > 0}
  onWatchlist={isOnWatchlist(film.tmdbId)}
  onOpen={() => onOpenFilm(film)}
  onToggleWatchlist={() => onToggleWatchlist(film, availability)}
  onToggleWatched={() => onToggleWatched(film, availability)}
/>`,
  metadata: { nestable: true },
}
