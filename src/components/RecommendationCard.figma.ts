// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=27-31
// component=RecommendationCard
// source=https://github.com/frames-by-brian/vibe-coded-apps/blob/main/src/components/RecommendationCard.tsx

import figma from 'figma'

// The rail card, not the row card — see the note in RecommendationCard.tsx for why
// this is separate from MovieCard. Snippet mirrors RecommendationsCarousel.tsx,
// the only place this renders.
export default {
  id: 'RecommendationCard',
  imports: ["import { RecommendationCard } from './RecommendationCard'"],
  example: figma.code`<RecommendationCard
  movie={movie}
  watched={watched}
  onOpen={onOpen}
  onToggleWatched={onToggleWatched}
  onStartWatching={onStartWatching}
  reason={reason}
/>`,
  metadata: { nestable: true },
}
