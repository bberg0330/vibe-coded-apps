// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=341-30
// component=WatchlistRow
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/WatchlistRow.tsx

import figma from 'figma'

export default {
  id: 'WatchlistRow',
  imports: ["import { WatchlistRow } from './WatchlistRow'"],
  example: figma.code`<WatchlistRow
  entry={entry}
  addedByName={profileName(entry.profileId)}
  onOpenMovie={onOpenMovie}
  onMarkWatched={onMarkWatched}
  onRemove={onRemove}
  pending={pending}
/>`,
  metadata: { nestable: true },
}
