// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=53-305
// component=ProfileOption
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/ProfileOption.tsx

import figma from 'figma'

const name = figma.selectedInstance.getString('Label')
const selected = figma.selectedInstance.getPropertyValue('State') === 'Selected'

export default {
  id: 'ProfileOption',
  imports: ["import { ProfileOption } from './ProfileOption'"],
  example: figma.code`<ProfileOption name="${name}" selected={${selected}} onClick={() => setPending(profile.id)} />`,
  metadata: { nestable: true },
}
