// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=4-4
// component=Badge
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/Badge.tsx

import figma from 'figma'

const label = figma.selectedInstance.getString('label')

export default {
  id: 'Badge',
  imports: ["import { Badge } from './Badge'"],
  example: figma.code`<Badge label="${label}" />`,
  metadata: { nestable: true },
}
