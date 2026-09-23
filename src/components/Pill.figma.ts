// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=4-7
// component=Pill
// source=https://github.com/frames-by-brian/vibe-coded-apps/blob/main/src/components/Pill.tsx

import figma from 'figma'

const label = figma.selectedInstance.getString('label')

export default {
  id: 'Pill',
  imports: ["import { Pill } from './Pill'"],
  example: figma.code`<Pill>${label}</Pill>`,
  metadata: { nestable: true },
}
