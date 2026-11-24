// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=376-314
// component=ScoreLegend
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/ScoreLegend.tsx

import figma from 'figma'

// No props: one fixed line, placed under each scored list's heading.
export default {
  id: 'ScoreLegend',
  imports: ["import { ScoreLegend } from './ScoreLegend'"],
  example: figma.code`<ScoreLegend />`,
  metadata: { nestable: true },
}
