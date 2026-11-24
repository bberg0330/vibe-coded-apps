// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=370-87
// component=SkeletonRow
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/SkeletonRows.tsx

import figma from 'figma'

// Figma's SkeletonRow is one row; the code component renders the set of three
// (plus the screen-reader-only loading text) that every loading state uses.
export default {
  id: 'SkeletonRow',
  imports: ["import { SkeletonRows } from './SkeletonRows'"],
  example: figma.code`<SkeletonRows label="Loading cast…" />`,
  metadata: { nestable: true },
}
