// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=171-1199
// component=MovieNightHeader
// source=https://github.com/frames-by-brian/vibe-coded-apps/blob/main/src/components/MovieNightHeader.tsx

import figma from 'figma'

// No component properties and no configurable descendants — the Title text
// layer isn't exposed as a property, and the component takes no props in
// code either. One fixed instance above the search field on Search/Homescreen.
export default {
  id: 'MovieNightHeader',
  imports: ["import { MovieNightHeader } from './MovieNightHeader'"],
  example: figma.code`<MovieNightHeader />`,
  metadata: { nestable: true },
}
