// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=349-14
// component=SheetOption
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/SheetOption.tsx

import figma from 'figma'

const selected = figma.selectedInstance.getEnum('State', {
  Default: false,
  Selected: true,
})

// "Show description" is off by default, so most rows (Sort by, Genre) omit
// the prop; with it on, the Description text becomes the `description` prop.
const showDescription = figma.selectedInstance.getBoolean('Show description')
const description = figma.selectedInstance.getString('Description')
const descriptionProp = showDescription ? `\n  description="${description}"` : ''

export default {
  id: 'SheetOption',
  imports: ["import { SheetOption } from './SheetOption'"],
  example: figma.code`<SheetOption
  label={label}
  selected={${selected}}${descriptionProp}
  onSelect={onSelect}
/>`,
  metadata: { nestable: true },
}
