// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=5-16
// component=IconButton
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/IconButton.tsx

import figma from 'figma'

const icon = figma.selectedInstance.getString('icon')
const watched = figma.selectedInstance.getEnum('State', {
  Default: false,
  Watched: true,
  Disabled: false,
  Primary: false,
})
const disabled = figma.selectedInstance.getEnum('State', {
  Default: false,
  Watched: false,
  Disabled: true,
  Primary: false,
})
const primary = figma.selectedInstance.getEnum('State', {
  Default: false,
  Watched: false,
  Disabled: false,
  Primary: true,
})

export default {
  id: 'IconButton',
  imports: ["import { IconButton } from './IconButton'"],
  example: figma.code`<IconButton
  icon="${icon}"
  watched={${watched}}
  primary={${primary}}
  disabled={${disabled}}
  ariaLabel={ariaLabel}
  onClick={onClick}
/>`,
  metadata: { nestable: true },
}
