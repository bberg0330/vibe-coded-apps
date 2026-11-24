// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=373-1976
// component=HistoryMenu
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/HistoryMenu.tsx

import figma from 'figma'

// The Figma component has no props: it is always the two rows. In code,
// "Move to Seen before" is left out when nothing handles it, and the delete
// row reads "Deleting…" (disabled) while a delete is in flight.
export default {
  id: 'HistoryMenu',
  imports: ["import { HistoryMenu } from './HistoryMenu'"],
  example: figma.code`<HistoryMenu
  onMoveToSeenBefore={onMoveToSeenBefore}
  onDelete={onDelete}
/>`,
  metadata: { nestable: true },
}
