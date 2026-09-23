// url=https://www.figma.com/design/ajsVg5LjRT7Y5D346WMif3/Movie-Night-UX-UI-Baseline?node-id=27-9
// component=Button
// source=https://github.com/frames-by-brian/vibe-coded-apps/blob/main/src/components/Button.tsx

import figma from 'figma'

// State=Disabled is specifically the profile gate's disabled Continue button
// (see the set's own description) — that's the only real disabled Button in
// the app, so this branch mirrors ProfileGate.tsx exactly rather than a
// generic disabled example.
let template

if (figma.selectedInstance.getPropertyValue('State') === 'Disabled') {
  template = {
    id: 'Button',
    imports: ["import { Button } from './Button'"],
    example: figma.code`<Button className="profile-gate-continue" disabled={!pending} onClick={() => pending && onSelect(pending)}>
  Continue
</Button>`,
    metadata: { nestable: true },
  }
} else {
  template = {
    id: 'Button',
    imports: ["import { Button } from './Button'"],
    example: figma.code`<Button onClick={onRetry}>Try again</Button>`,
    metadata: { nestable: true },
  }
}

export default template
