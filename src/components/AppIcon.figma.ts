// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=303-17
// component=AppIcon
// source=https://github.com/frames-by-brian/vibe-coded-apps/blob/main/src/components/AppIcon.tsx

import figma from 'figma'

// No component properties — the icon artwork is fixed. Size comes from how
// the instance is scaled in Figma, which Code Connect can't read, so the
// snippet shows the default size.
export default {
  id: 'AppIcon',
  imports: ["import { AppIcon } from './AppIcon'"],
  example: figma.code`<AppIcon />`,
  metadata: { nestable: true },
}
