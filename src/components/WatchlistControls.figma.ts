// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=349-15
// component=WatchlistControls
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/WatchlistControls.tsx

import figma from 'figma'

// Chip states and labels in Figma are per-instance overrides of nested Chips,
// not component props, so the snippet shows the real wiring from
// WatchlistScreen.tsx rather than mapping values.
export default {
  id: 'WatchlistControls',
  imports: ["import { WatchlistControls } from './WatchlistControls'"],
  example: figma.code`<WatchlistControls
  view={view}
  profiles={profiles}
  shown={shown.length}
  total={entries.length}
  filtered={isFiltered(view)}
  onChange={setView}
  onOpenSort={() => setSheet('sort')}
  onOpenGenre={() => setSheet('genre')}
  onClearFilters={() => setView(clearFilters(view))}
/>`,
  metadata: { nestable: true },
}
