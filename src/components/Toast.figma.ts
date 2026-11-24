// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=370-63
// component=Toast
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/Toast.tsx

import figma from 'figma'

const message = figma.selectedInstance.getString('Message')
const actionLabel = figma.selectedInstance.getString('Action')

// App.tsx renders the one toast; timing and one-at-a-time live there.
export default {
  id: 'Toast',
  imports: ["import { Toast } from './Toast'"],
  example: figma.code`<Toast message="${message}" actionLabel="${actionLabel}" onAction={onAction} />`,
  metadata: { nestable: true },
}
