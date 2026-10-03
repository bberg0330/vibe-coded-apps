// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=11-18
// component=SectionHeading
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/SectionHeading.tsx

import figma from 'figma'

const label = figma.selectedInstance.getString('label')

export default {
  id: 'SectionHeading',
  imports: ["import { SectionHeading } from './SectionHeading'"],
  example: figma.code`<SectionHeading>${label}</SectionHeading>`,
  metadata: { nestable: true },
}
