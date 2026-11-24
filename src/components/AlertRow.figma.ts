// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=385-110
// component=AlertRow
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/AlertRow.tsx

import figma from 'figma'

export default {
  id: 'AlertRow',
  imports: ["import { AlertRow } from './AlertRow'"],
  example: figma.code`<AlertRow
  alert={alert}
  onOpen={() => onOpen(alert)}
  onWatchTonight={() => onWatchTonight(alert)}
  onDismiss={() => onDismiss(alert)}
/>`,
  metadata: { nestable: true },
}
