// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=27-31
// component=RecommendationCard
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/RecommendationCard.tsx

import figma from 'figma'

// The rail card, not the row card — see the note in RecommendationCard.tsx for why
// this is separate from MovieCard. Snippet mirrors RecommendationsCarousel.tsx,
// the only place this renders. title and the two scores (criticScore/audienceScore
// and their show* toggles) live inside `movie` in code, so only the reason caption
// maps: `showReason` off means no caption.
const showReason = figma.selectedInstance.getBoolean('showReason')
const reason = figma.selectedInstance.getString('reason')
const reasonProp = showReason ? `\n  reason="${reason}"` : ''

export default {
  id: 'RecommendationCard',
  imports: ["import { RecommendationCard } from './RecommendationCard'"],
  example: figma.code`<RecommendationCard
  movie={movie}
  onOpen={onOpen}${reasonProp}
/>`,
  metadata: { nestable: true },
}
