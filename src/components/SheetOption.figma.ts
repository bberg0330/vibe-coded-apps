// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=349-14
// component=SheetOption
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/SheetOption.tsx

import figma from 'figma'

const selected = figma.selectedInstance.getEnum('State', {
  Default: false,
  Selected: true,
})

export default {
  id: 'SheetOption',
  imports: ["import { SheetOption } from './SheetOption'"],
  example: figma.code`<SheetOption
  label={label}
  selected={${selected}}
  onSelect={onSelect}
/>`,
  metadata: { nestable: true },
}
