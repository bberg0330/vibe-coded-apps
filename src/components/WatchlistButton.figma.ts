// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=341-11
// component=WatchlistButton
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/WatchlistButton.tsx

import figma from 'figma'

const saved = figma.selectedInstance.getEnum('State', {
  Default: false,
  Saved: true,
})
// Size=Compact is the 36x36 form pinned to a RecommendationCard poster.
const compact = figma.selectedInstance.getEnum('Size', {
  Default: false,
  Compact: true,
})

export default {
  id: 'WatchlistButton',
  imports: ["import { WatchlistButton } from './WatchlistButton'"],
  example: figma.code`<WatchlistButton
  title={movie.title}
  saved={${saved}}
  compact={${compact}}
  onClick={() => onToggleWatchlist(movie)}
/>`,
  metadata: { nestable: true },
}
