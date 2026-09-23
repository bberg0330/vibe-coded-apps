// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=10-7
// component=PersonCard
// source=https://github.com/frames-by-brian/vibe-coded-apps/blob/main/src/components/PersonCard.tsx

import figma from 'figma'

// Figma's `name`/`character` text props live inside `person` in code, so neither maps.
export default {
  id: 'PersonCard',
  imports: ["import { PersonCard } from './PersonCard'"],
  example: figma.code`<PersonCard person={person} onOpen={onOpenActor} />`,
  metadata: { nestable: true },
}
