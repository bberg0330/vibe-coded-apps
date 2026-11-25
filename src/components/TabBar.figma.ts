// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=390-2791
// component=TabBar
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/TabBar.tsx

import figma from 'figma'

// Figma's Current variant is the active tab; None marks no tab (Cast and
// Filmography are drill-downs, so every tab stays tappable).
const current = figma.selectedInstance.getEnum('Current', {
  Search: "'search'",
  Watchlist: "'watchlist'",
  History: "'history'",
  None: 'null',
})

export default {
  id: 'TabBar',
  imports: ["import { TabBar } from './TabBar'"],
  example: figma.code`<TabBar current={${current}} onSelect={selectTab} />`,
  metadata: { nestable: true },
}
