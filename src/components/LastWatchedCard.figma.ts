// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=133-21
// component=LastWatchedCard
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/LastWatchedCard.tsx

import figma from 'figma'

// No variants and nothing to map: the component takes a single `movie` prop and
// renders read-only, so the Figma side has no state to branch on.
export default {
  id: 'LastWatchedCard',
  imports: ["import { LastWatchedCard } from './LastWatchedCard'"],
  example: figma.code`<LastWatchedCard movie={movie} />`,
  metadata: { nestable: true },
}
