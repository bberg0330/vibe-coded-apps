// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=446-5333
// component=YearTile
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/YearTile.tsx

import figma from 'figma'

// Figma's `count` is the whole "7 of 100 watched" line; code takes the numbers.
// Figma's `progress` variant (0-100 in 10% steps) only keeps mocks honest: the
// app draws the bar from watched/total, so it has nothing to map to.
const year = figma.selectedInstance.getString('year')

export default {
  id: 'YearTile',
  imports: ["import { YearTile } from './YearTile'"],
  example: figma.code`<YearTile year={${year}} watched={watched} total={ids.length} onOpen={() => onOpenYear(${year})} />`,
  metadata: { nestable: true },
}
