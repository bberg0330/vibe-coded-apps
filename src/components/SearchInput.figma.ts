// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=11-15
// component=SearchInput
// source=https://github.com/bberg0330/vibe-coded-apps/blob/main/src/components/SearchInput.tsx

import figma from 'figma'

const placeholder = figma.selectedInstance.getString('placeholder')

export default {
  id: 'SearchInput',
  imports: ["import { SearchInput } from './SearchInput'"],
  example: figma.code`<SearchInput value={query} onChange={setQuery} placeholder="${placeholder}" autoFocus />`,
  metadata: { nestable: true },
}
