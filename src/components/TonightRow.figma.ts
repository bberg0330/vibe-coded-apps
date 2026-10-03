// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=10-19
// component=TonightRow
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/TonightRow.tsx

import figma from 'figma'

export default {
  id: 'TonightRow',
  imports: ["import { TonightRow } from './TonightRow'"],
  example: figma.code`<TonightRow
  entry={entry}
  onOpenMovie={onOpenMovie}
  onCancelWatching={onCancelWatching}
  cancelling={cancelling}
/>`,
  metadata: { nestable: true },
}
