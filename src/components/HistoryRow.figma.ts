// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=10-32
// component=HistoryRow
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/HistoryRow.tsx

import figma from 'figma'

export default {
  id: 'HistoryRow',
  imports: ["import { HistoryRow } from './HistoryRow'"],
  example: figma.code`<HistoryRow
  entry={entry}
  count={count}
  onOpenMovie={onOpenMovie}
  isMenuOpen={isMenuOpen}
  isDeleting={isDeleting}
  onToggleMenu={onToggleMenu}
  onDelete={onDelete}
/>`,
  metadata: { nestable: true },
}
