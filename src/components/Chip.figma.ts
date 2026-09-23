// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=4-14
// component=Chip
// source=https://github.com/frames-by-brian/vibe-coded-apps/blob/main/src/components/Chip.tsx

import figma from 'figma'

// No exposed text property — the label is just the layer's own name/content
// per instance ("Laura"/"Brian"), not a component property Code Connect can
// read generically. `label` is left as a pseudocode variable, same as
// MovieCard.figma.ts's `movie`/`onOpenMovie`.
const active = figma.selectedInstance.getPropertyValue('State') === 'Active'

export default {
  id: 'Chip',
  imports: ["import { Chip } from './Chip'"],
  example: figma.code`<Chip label={profile.name} active={${active}} onClick={() => selectProfile(profile.id)} />`,
  metadata: { nestable: true },
}
