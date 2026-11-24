// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=380-30
// component=TabBar
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/TabBar.tsx

import figma from 'figma'

// Figma's TabItem is one item; in code the whole bar is one component that
// renders an item per tab. `alert` shows the dot on that tab's icon.
const label = figma.selectedInstance.getString('label')
const alert = figma.selectedInstance.getBoolean('alert')

export default {
  id: 'TabBar',
  imports: ["import { TabBar } from './TabBar'"],
  example: figma.code`<TabBar
  current={tabFor(current)}
  ${alert ? `alert="${label.toLowerCase()}"` : ''}
  onSelect={(tab) => navigate({ kind: tab })}
/>`,
  metadata: { nestable: true },
}
