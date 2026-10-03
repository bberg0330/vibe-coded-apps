// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=5-6
// component=Poster
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/Poster.tsx

import figma from 'figma'

// Connects the set: State=Artwork is a poster, State=Empty is the null-src
// fallback the component renders internally — both are the same component,
// just different values of the one `src` prop.
let template

if (figma.selectedInstance.getPropertyValue('State') === 'Artwork') {
  template = {
    id: 'Poster',
    imports: ["import { Poster } from './Poster'"],
    example: figma.code`<Poster src={posterUrl} />`,
    metadata: { nestable: true },
  }
} else {
  template = {
    id: 'Poster',
    imports: ["import { Poster } from './Poster'"],
    example: figma.code`<Poster src={null} />`,
    metadata: { nestable: true },
  }
}

export default template
